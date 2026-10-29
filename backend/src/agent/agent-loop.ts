import type { ToolCall, ToolResult } from "../tools/types.js";
import type {
  AgentEvent,
  AgentMessage,
  AgentRunOptions,
  AgentRunResult,
  ModelCompletionResponse,
} from "./types.js";

export class AgentLoopError extends Error {
  constructor(
    message: string,
    public readonly code: "max_iterations" | "max_tool_calls" | "invalid_model_response",
  ) {
    super(message);
    this.name = "AgentLoopError";
  }
}

export async function runAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  const messages = [...options.messages];
  const events: AgentEvent[] = [{ type: "started" }];
  let toolCallCount = 0;

  for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
    events.push({ type: "iteration_started", iteration });
    const response = await options.complete({
      messages: [...messages],
      tools: [...options.tools],
    });

    if (response.kind === "final") {
      events.push({ type: "finished", iterations: iteration });
      return { text: response.text, messages, events, iterations: iteration };
    }

    validateToolCalls(response.calls);
    toolCallCount += response.calls.length;

    if (toolCallCount > options.maxToolCalls) {
      events.push({ type: "stopped", reason: "maximum_tool_calls_reached" });
      throw new AgentLoopError(
        `The agent exceeded the maximum of ${options.maxToolCalls} tool calls.`,
        "max_tool_calls",
      );
    }

    messages.push(response.message);

    for (const call of response.calls) {
      events.push({ type: "tool_selected", toolCallId: call.id, name: call.name });
      const result = await options.execute(call);
      messages.push(toToolMessage(result));
      events.push({
        type: "tool_completed",
        toolCallId: call.id,
        name: call.name,
        isError: result.isError === true,
        output: result.output,
      });
    }
  }

  events.push({ type: "stopped", reason: "maximum_iterations_reached" });
  throw new AgentLoopError(
    `The agent exceeded the maximum of ${options.maxIterations} iterations.`,
    "max_iterations",
  );
}

function validateToolCalls(calls: ToolCall[]): void {
  if (calls.length === 0) {
    throw new AgentLoopError(
      "The model requested tool execution without providing a tool call.",
      "invalid_model_response",
    );
  }

  for (const call of calls) {
    if (!call.id || !call.name || call.arguments === undefined) {
      throw new AgentLoopError("The model returned an invalid tool call.", "invalid_model_response");
    }
  }
}

function toToolMessage(result: ToolResult): AgentMessage {
  return {
    role: "tool",
    content: JSON.stringify(result.output),
    toolCallId: result.toolCallId,
    name: result.name,
  };
}
