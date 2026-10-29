import type { ChatMessage } from "../chat/types.js";

export type TokenEstimatorConfig = {
  strategy: "character-ratio" | "whitespace";
  charsPerToken: number;
  messageOverheadTokens: number;
};

export type ContextEstimate = {
  estimator: TokenEstimatorConfig["strategy"];
  instructionsTokens: number;
  messageTokens: number;
  estimatedInputTokens: number;
  availableInputTokens: number;
  remainingInputTokens: number;
  withinBudget: boolean;
};

export function estimateTextTokens(
  text: string,
  config: TokenEstimatorConfig,
): number {
  if (config.strategy === "whitespace") {
    return text.trim() ? text.trim().split(/\s+/u).length : 0;
  }

  const characterCount = Array.from(text).length;

  return characterCount === 0
    ? 0
    : Math.ceil(characterCount / config.charsPerToken);
}

export function estimateMessageTokens(
  message: ChatMessage,
  config: TokenEstimatorConfig,
): number {
  return (
    config.messageOverheadTokens + estimateTextTokens(message.content, config)
  );
}

export function estimateContext(
  instructions: string,
  messages: ChatMessage[],
  config: TokenEstimatorConfig,
  availableInputTokens: number,
): ContextEstimate {
  const instructionsTokens = estimateTextTokens(instructions, config);
  const messageTokens = messages.reduce(
    (total, message) => total + estimateMessageTokens(message, config),
    0,
  );
  const estimatedInputTokens = instructionsTokens + messageTokens;
  const remainingInputTokens = availableInputTokens - estimatedInputTokens;

  return {
    estimator: config.strategy,
    instructionsTokens,
    messageTokens,
    estimatedInputTokens,
    availableInputTokens,
    remainingInputTokens,
    withinBudget: remainingInputTokens >= 0,
  };
}
