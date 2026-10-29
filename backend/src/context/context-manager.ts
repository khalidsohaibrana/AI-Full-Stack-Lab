import type { ChatMessage } from "../chat/types.js";
import {
  estimateContext,
  estimateMessageTokens,
  estimateTextTokens,
  type ContextEstimate,
  type TokenEstimatorConfig,
} from "./token-estimator.js";

export type ContextTruncationStrategy = "recent-turns";

export type ContextManagerConfig = {
  strategy: ContextTruncationStrategy;
  oversizedMessagePolicy: "reject";
};

export type ManagedContext = {
  messages: ChatMessage[];
  estimate: ContextEstimate;
  truncation: {
    strategy: ContextTruncationStrategy;
    wasTruncated: boolean;
    receivedMessages: number;
    sentMessages: number;
    droppedMessages: number;
    droppedTokens: number;
  };
};

export class ContextWindowError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "instructions_too_large"
      | "message_too_large"
      | "turn_too_large",
  ) {
    super(message);
    this.name = "ContextWindowError";
  }
}

type Turn = {
  messages: ChatMessage[];
  tokens: number;
};

function getTurnTokens(
  messages: ChatMessage[],
  estimatorConfig: TokenEstimatorConfig,
): number {
  return messages.reduce(
    (total, message) =>
      total + estimateMessageTokens(message, estimatorConfig),
    0,
  );
}

function groupIntoTurns(
  messages: ChatMessage[],
  estimatorConfig: TokenEstimatorConfig,
): Turn[] {
  const turns: Turn[] = [];
  let currentTurn: ChatMessage[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      if (currentTurn.length > 0) {
        turns.push({
          messages: currentTurn,
          tokens: getTurnTokens(currentTurn, estimatorConfig),
        });
      }

      currentTurn = [message];
      continue;
    }

    currentTurn.push(message);
    turns.push({
      messages: currentTurn,
      tokens: getTurnTokens(currentTurn, estimatorConfig),
    });
    currentTurn = [];
  }

  if (currentTurn.length > 0) {
    turns.push({
      messages: currentTurn,
      tokens: getTurnTokens(currentTurn, estimatorConfig),
    });
  }

  return turns;
}

function findNewestUserTurnIndex(turns: Turn[]): number {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (turns[index]?.messages.some((message) => message.role === "user")) {
      return index;
    }
  }

  return -1;
}

function flattenTurns(turns: Turn[]): ChatMessage[] {
  return turns.flatMap((turn) => turn.messages);
}

export function prepareContext(
  instructions: string,
  messages: ChatMessage[],
  estimatorConfig: TokenEstimatorConfig,
  availableInputTokens: number,
  managerConfig: ContextManagerConfig,
): ManagedContext {
  if (managerConfig.strategy !== "recent-turns") {
    throw new ContextWindowError(
      `Unsupported context truncation strategy: ${managerConfig.strategy}`,
      "turn_too_large",
    );
  }

  const instructionsTokens = estimateTextTokens(instructions, estimatorConfig);
  const messageBudget = availableInputTokens - instructionsTokens;

  if (messageBudget <= 0) {
    throw new ContextWindowError(
      "System instructions are larger than the available context input budget.",
      "instructions_too_large",
    );
  }

  const turns = groupIntoTurns(messages, estimatorConfig);
  const newestUserTurnIndex = findNewestUserTurnIndex(turns);

  if (newestUserTurnIndex === -1) {
    throw new ContextWindowError(
      "A conversation must contain at least one user message.",
      "message_too_large",
    );
  }

  const newestUserTurn = turns[newestUserTurnIndex];

  if (newestUserTurn.tokens > messageBudget) {
    const largestMessageTokens = Math.max(
      ...newestUserTurn.messages.map((message) =>
        estimateMessageTokens(message, estimatorConfig),
      ),
    );

    if (largestMessageTokens > messageBudget) {
      throw new ContextWindowError(
        `The newest message is estimated at ${largestMessageTokens} tokens, exceeding the available input budget of ${messageBudget} tokens.`,
        "message_too_large",
      );
    }

    throw new ContextWindowError(
      `The newest complete turn is estimated at ${newestUserTurn.tokens} tokens, exceeding the available input budget of ${messageBudget} tokens.`,
      "turn_too_large",
    );
  }

  const selectedTurns: Turn[] = [newestUserTurn];
  let selectedTokens = newestUserTurn.tokens;

  for (let index = newestUserTurnIndex - 1; index >= 0; index -= 1) {
    const turn = turns[index];

    if (selectedTokens + turn.tokens > messageBudget) break;

    selectedTurns.unshift(turn);
    selectedTokens += turn.tokens;
  }

  const selectedMessages = flattenTurns(selectedTurns);
  const estimate = estimateContext(
    instructions,
    selectedMessages,
    estimatorConfig,
    availableInputTokens,
  );
  const droppedMessages = messages.length - selectedMessages.length;
  const allMessageTokens = getTurnTokens(messages, estimatorConfig);

  return {
    messages: selectedMessages,
    estimate,
    truncation: {
      strategy: managerConfig.strategy,
      wasTruncated: droppedMessages > 0,
      receivedMessages: messages.length,
      sentMessages: selectedMessages.length,
      droppedMessages,
      droppedTokens: allMessageTokens - selectedTokens,
    },
  };
}
