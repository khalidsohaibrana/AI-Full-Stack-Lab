import { runAgent } from "../agent/agent-loop.js";
import type { AgentMessage, AgentRunResult, ModelCompletionRequest, ModelCompletionResponse } from "../agent/types.js";
import type { ToolCall, ToolDefinition, ToolResult } from "../tools/types.js";
import { runSupervisor, type SupervisorProgress, type SupervisorTask, type SupervisorTaskResult } from "./supervisor.js";

export type SupervisorOrchestrationResult = {
  text: string;
  tasks: SupervisorTask[];
  results: Array<SupervisorTaskResult<AgentRunResult>>;
  events: Array<SupervisorProgress<AgentRunResult>>;
};

export async function runSupervisorOrchestrator(options: {
  complete: (request: ModelCompletionRequest) => Promise<ModelCompletionResponse>;
  userRequest: string;
  baseMessages: AgentMessage[];
  instructions: string;
  tools: ToolDefinition[];
  execute: (call: ToolCall) => Promise<ToolResult>;
  maxIterations: number;
  maxToolCalls: number;
  maxRetries: number;
  maxAgents: number;
  onProgress?: (event: SupervisorProgress<AgentRunResult>) => void;
}): Promise<SupervisorOrchestrationResult> {
  const tasks = await createTasks(options);
  const events: Array<SupervisorProgress<AgentRunResult>> = [];
  const emit = (event: SupervisorProgress<AgentRunResult>) => { events.push(event); options.onProgress?.(event); };
  const results = await runSupervisor(tasks, {
    maxRetries: options.maxRetries,
    workerIds: Array.from({ length: Math.max(1, options.maxAgents) }, (_, index) => `supervisor-worker-${index + 1}`),
    run: async (task, workerId, attempt) => runAgent({
      messages: [
        { role: "system", content: `${options.instructions}\nYou are a supervised worker. Complete only this task: ${task.objective}. Attempt ${attempt}; worker id ${workerId}. Return a concise report.` },
        ...options.baseMessages,
        { role: "user", content: `Original request: ${options.userRequest}\nAssigned task: ${task.objective}` },
      ],
      tools: options.tools,
      complete: options.complete,
      execute: options.execute,
      maxIterations: options.maxIterations,
      maxToolCalls: options.maxToolCalls,
    }),
    onProgress: emit,
  });
  const evidence = results.map((result) => result.status === "completed"
    ? `${result.task.id}: ${result.value.text}`
    : `${result.task.id}: escalated after failures: ${result.error}`).join("\n");
  const finalResponse = await options.complete({
    messages: [
      { role: "system", content: `${options.instructions}\nYou are the supervisor summarizing worker results. Report successful work and clearly disclose escalated failures. Do not invent facts.` },
      { role: "user", content: `Original request: ${options.userRequest}\nSupervisor results:\n${evidence}` },
    ],
    tools: [],
  });
  if (finalResponse.kind !== "final") throw new Error("The supervisor requested an unexpected tool call.");
  return { text: finalResponse.text, tasks, results, events };
}

async function createTasks(options: {
  complete: (request: ModelCompletionRequest) => Promise<ModelCompletionResponse>;
  userRequest: string;
  tools: ToolDefinition[];
  maxAgents: number;
}): Promise<SupervisorTask[]> {
  const response = await options.complete({
    messages: [
      { role: "system", content: `Create up to ${options.maxAgents} independent tasks for a supervisor. Return JSON only: {"tasks":[{"id":"task-1","objective":"..."}]}. Use one task when decomposition is unnecessary.` },
      { role: "user", content: `Request: ${options.userRequest}\nAvailable tools: ${options.tools.map((tool) => tool.name).join(", ")}` },
    ],
    tools: [],
    responseFormat: "json_object",
  });
  if (response.kind !== "final") throw new Error("The supervisor task planner requested an unexpected tool call.");
  const parsed = JSON.parse(response.text) as { tasks?: Array<{ id?: string; objective?: string }> };
  const tasks = (parsed.tasks ?? []).filter((task) => task.id?.trim() && task.objective?.trim()).slice(0, options.maxAgents).map((task) => ({ id: task.id!.trim(), objective: task.objective!.trim() }));
  if (tasks.length === 0) return [{ id: "task-1", objective: options.userRequest }];
  return tasks;
}
