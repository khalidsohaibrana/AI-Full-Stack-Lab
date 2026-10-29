import { runAgent } from "../agent/agent-loop.js";
import type { AgentMessage, AgentRunResult, ModelCompletionRequest, ModelCompletionResponse } from "../agent/types.js";
import type { ToolCall, ToolDefinition, ToolResult } from "../tools/types.js";
import { HandoffRouter, type HandoffProgress, type HandoffRequest } from "./handoff.js";

export type HandoffWorker = {
  id: "researcher" | "reviewer";
  result: AgentRunResult;
  handoff: HandoffRequest;
};

export type HandoffOrchestrationResult = {
  text: string;
  workers: HandoffWorker[];
  handoffs: HandoffProgress[];
};

export async function runHandoffOrchestrator(options: {
  complete: (request: ModelCompletionRequest) => Promise<ModelCompletionResponse>;
  userRequest: string;
  baseMessages: AgentMessage[];
  instructions: string;
  tools: ToolDefinition[];
  execute: (call: ToolCall) => Promise<ToolResult>;
  maxIterations: number;
  maxToolCalls: number;
  onProgress?: (event: HandoffProgress) => void;
}): Promise<HandoffOrchestrationResult> {
  const router = new HandoffRouter();
  const handoffs: HandoffProgress[] = [];
  const emit = (event: HandoffProgress) => {
    handoffs.push(event);
    options.onProgress?.(event);
  };
  const workers: HandoffWorker[] = [];

  router.register("researcher", async (handoff) => {
    const result = await runSpecialist("researcher", handoff, options);
    workers.push({ id: "researcher", result, handoff });
    return result.text;
  });
  router.register("reviewer", async (handoff) => {
    const result = await runSpecialist("reviewer", handoff, options);
    workers.push({ id: "reviewer", result, handoff });
    return result.text;
  });

  const researchHandoff = createHandoff({
    id: "handoff-researcher",
    fromAgent: "lead",
    toAgent: "researcher",
    reason: "The request needs evidence gathered before another agent reviews it.",
    task: `Investigate the user's request and gather the most relevant evidence: ${options.userRequest}`,
    context: { originalRequest: options.userRequest },
    allowedActions: options.tools.map((tool) => tool.name),
    handoffCount: 0,
  });
  const researchResult = await router.route(researchHandoff, { onProgress: emit });
  if (researchResult.status === "rejected") throw new Error(`Research handoff failed: ${researchResult.reason}`);

  const researchWorker = workers[0];
  if (!researchWorker) throw new Error("Research handoff completed without a worker result.");

  const reviewHandoff = createHandoff({
    id: "handoff-reviewer",
    fromAgent: "researcher",
    toAgent: "reviewer",
    reason: "The evidence is ready for an independent quality check.",
    task: "Review the research, identify unsupported claims or missing details, and provide corrections.",
    context: {
      originalRequest: options.userRequest,
      researchResult: researchWorker.result.text,
    },
    allowedActions: ["review", "validate", "report"],
    handoffCount: 1,
  });
  const reviewResult = await router.route(reviewHandoff, { onProgress: emit });
  if (reviewResult.status === "rejected") throw new Error(`Review handoff failed: ${reviewResult.reason}`);

  const reviewerWorker = workers[1];
  if (!reviewerWorker) throw new Error("Review handoff completed without a worker result.");

  const finalResponse = await options.complete({
    messages: [
      {
        role: "system",
        content: `${options.instructions}\nYou are the lead agent summarizing a completed handoff workflow. Answer the original request using the research and review evidence. Do not mention hidden reasoning or invent facts.`,
      },
      {
        role: "user",
        content: `Original request: ${options.userRequest}\nResearch result:\n${researchWorker.result.text}\nReview result:\n${reviewerWorker.result.text}`,
      },
    ],
    tools: [],
  });
  if (finalResponse.kind !== "final") throw new Error("The handoff lead requested an unexpected tool call.");

  return { text: finalResponse.text, workers, handoffs };
}

function createHandoff(input: Omit<HandoffRequest, "maxHandoffs">): HandoffRequest {
  return { ...input, maxHandoffs: 2 };
}

async function runSpecialist(
  role: "researcher" | "reviewer",
  handoff: HandoffRequest,
  options: {
    complete: (request: ModelCompletionRequest) => Promise<ModelCompletionResponse>;
    baseMessages: AgentMessage[];
    instructions: string;
    tools: ToolDefinition[];
    execute: (call: ToolCall) => Promise<ToolResult>;
    maxIterations: number;
    maxToolCalls: number;
    onProgress?: (event: HandoffProgress) => void;
  },
): Promise<AgentRunResult> {
  const roleInstruction = role === "researcher"
    ? "Gather evidence and explain what is relevant. Do not make unsupported claims."
    : "Review the supplied research critically. Identify gaps, contradictions, and corrections."
  const context = JSON.stringify(handoff.context);
  return runAgent({
    messages: [
      { role: "system", content: `${options.instructions}\nYou are the ${role} specialist in a handoff workflow. ${roleInstruction} Return a concise report for the lead agent.` },
      ...options.baseMessages,
      { role: "user", content: `Handoff task: ${handoff.task}\nFocused context: ${context}\nAllowed actions: ${handoff.allowedActions.join(", ")}` },
    ],
    tools: options.tools,
    complete: options.complete,
    execute: options.execute,
    maxIterations: options.maxIterations,
    maxToolCalls: options.maxToolCalls,
    onEvent: (event) => options.onProgress?.({
      type: "handoff_worker_event",
      workerId: role,
      event,
    } as HandoffProgress),
  });
}
