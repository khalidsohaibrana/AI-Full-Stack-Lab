import type { ToolCall, ToolDefinition, ToolResult } from "../tools/types.js";

export type AgentMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      toolCalls?: ToolCall[];
    }
  | { role: "tool"; content: string; toolCallId: string; name: string };

export type ModelCompletionRequest = {
  messages: AgentMessage[];
  tools: ToolDefinition[];
  responseFormat?: "json_object";
};

export type ModelCompletionResponse =
  | { kind: "final"; text: string }
  | { kind: "tool_calls"; message: AgentMessage & { role: "assistant" }; calls: ToolCall[] };

export type AgentEvent =
  | { type: "started" }
  | { type: "iteration_started"; iteration: number }
  | { type: "tool_selected"; toolCallId: string; name: string }
  | { type: "tool_completed"; toolCallId: string; name: string; isError: boolean; output?: unknown }
  | { type: "finished"; iterations: number }
  | { type: "stopped"; reason: string };

export type AgentRunOptions = {
  messages: AgentMessage[];
  tools: ToolDefinition[];
  complete: (request: ModelCompletionRequest) => Promise<ModelCompletionResponse>;
  execute: (call: ToolCall) => Promise<ToolResult>;
  maxIterations: number;
  maxToolCalls: number;
};

export type AgentRunResult = {
  text: string;
  messages: AgentMessage[];
  events: AgentEvent[];
  iterations: number;
};
