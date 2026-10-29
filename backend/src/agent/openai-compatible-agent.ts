import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { AgentMessage, ModelCompletionRequest, ModelCompletionResponse } from "./types.js";

export async function completeWithOpenAICompatibleProvider(
  client: OpenAI,
  model: string,
  maxOutputTokens: number,
  request: ModelCompletionRequest,
): Promise<ModelCompletionResponse> {
  const response = await client.chat.completions.create({
    model,
    max_tokens: maxOutputTokens,
    messages: request.messages.map(toProviderMessage) as ChatCompletionMessageParam[],
    tools: request.tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    })),
    ...(request.responseFormat
      ? { response_format: { type: request.responseFormat } }
      : {}),
  });

  const message = response.choices[0]?.message;

  if (!message) {
    throw new Error("The model returned an empty response.");
  }

  const functionToolCalls = message.tool_calls?.filter(
    (toolCall) => toolCall.type === "function",
  );

  if (functionToolCalls && functionToolCalls.length > 0) {
    return {
      kind: "tool_calls",
      message: {
        role: "assistant",
        content: message.content,
        toolCalls: functionToolCalls.map((toolCall) => ({
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: parseArguments(toolCall.function.arguments),
        })),
      },
      calls: functionToolCalls.map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: parseArguments(toolCall.function.arguments),
      })),
    };
  }

  const contentToolCall = parseContentToolCall(message.content, request.tools.map((tool) => tool.name));
  if (contentToolCall) {
    return {
      kind: "tool_calls",
      message: {
        role: "assistant",
        content: message.content,
        toolCalls: [contentToolCall],
      },
      calls: [contentToolCall],
    };
  }

  return { kind: "final", text: message.content ?? "" };
}

export function parseContentToolCall(
  content: string | null | undefined,
  knownToolNames: string[],
): { id: string; name: string; arguments: unknown } | null {
  if (!content) return null;

  const normalized = content
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "");
  const jsonStart = normalized.indexOf("{");
  const jsonEnd = normalized.lastIndexOf("}");
  const candidate =
    jsonStart >= 0 && jsonEnd > jsonStart
      ? normalized.slice(jsonStart, jsonEnd + 1)
      : normalized;

  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const name = parsed.name;
    const argumentsValue = parsed.arguments ?? parsed.parameters;

    if (
      typeof name !== "string" ||
      !knownToolNames.includes(name) ||
      argumentsValue === undefined
    ) {
      return null;
    }

    return {
      id: `content_tool_call_${crypto.randomUUID()}`,
      name,
      arguments: argumentsValue,
    };
  } catch {
    return null;
  }
}

function toProviderMessage(message: AgentMessage): ChatCompletionMessageParam {
  if (message.role === "system" || message.role === "user") {
    return message;
  }

  if (message.role === "tool") {
    return {
      role: "tool",
      content: message.content,
      tool_call_id: message.toolCallId,
    };
  }

  return {
    role: "assistant",
    content: message.content,
    ...(message.toolCalls
      ? {
          tool_calls: message.toolCalls.map((toolCall) => ({
            id: toolCall.id,
            type: "function" as const,
            function: {
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.arguments),
            },
          })),
        }
      : {}),
  };
}

function parseArguments(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
