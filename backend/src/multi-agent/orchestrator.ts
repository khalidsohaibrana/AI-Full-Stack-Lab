import { runAgent } from "../agent/agent-loop.js";
import type { AgentMessage, AgentRunResult, ModelCompletionRequest, ModelCompletionResponse } from "../agent/types.js";
import type { ToolCall, ToolDefinition, ToolResult } from "../tools/types.js";
import { runParallelAgents, type ParallelAgentResult } from "./parallel-agents.js";
import type { AgentEvent } from "../agent/types.js";

type ParallelTask = { id: string; objective: string };

export type ParallelOrchestrationResult = {
  text: string;
  tasks: ParallelTask[];
  results: Array<ParallelAgentResult<AgentRunResult>>;
};

export async function runParallelOrchestrator(options: {
  complete: (request: ModelCompletionRequest) => Promise<ModelCompletionResponse>;
  userRequest: string;
  baseMessages: AgentMessage[];
  instructions: string;
  tools: ToolDefinition[];
  execute: (call: ToolCall) => Promise<ToolResult>;
  maxIterations: number;
  maxToolCalls: number;
  maxAgents: number;
  maxConcurrency: number;
  maxGenerationAttempts: number;
  onProgress?: (event: ParallelProgressEvent) => void;
}): Promise<ParallelOrchestrationResult> {
  options.onProgress?.({ type: "orchestrator_started" });
  const tasks = await createParallelTasks(options);
  options.onProgress?.({ type: "tasks_created", tasks });
  const results = await runParallelAgents(
    tasks.map((task) => ({
      id: task.id,
      run: () => runAgent({
        messages: [
          { role: "system", content: `${options.instructions}\nYou are an independent worker. Complete only the assigned subtask. Return a concise result for the orchestrator.` },
          ...options.baseMessages,
          { role: "user", content: `Assigned subtask: ${task.objective}` },
        ],
        tools: options.tools,
        complete: options.complete,
        execute: options.execute,
        maxIterations: options.maxIterations,
        maxToolCalls: options.maxToolCalls,
        onEvent: (event) => options.onProgress?.({ type: "worker_event", workerId: task.id, event }),
      }),
    })),
    {
      maxConcurrency: Math.min(options.maxConcurrency, options.maxAgents),
      onProgress: (event) => options.onProgress?.({
        type: "worker_progress",
        id: event.id,
        status: event.type === "finished" ? event.status : undefined,
        error: event.type === "finished" ? event.error : undefined,
      }),
    },
  );
  options.onProgress?.({ type: "aggregation_started" });

  const evidence = results.map((result) =>
    result.status === "fulfilled"
      ? `${result.id}: ${result.value.text}`
      : `${result.id}: worker failed: ${result.error}`,
  ).join("\n");
  const finalResponse = await options.complete({
    messages: [
      { role: "system", content: `${options.instructions}\nYou are the orchestrator summarizing independent worker results. Answer every independent subtask in the original request. Preserve successful numeric results and factual tool results exactly. Do not invent facts, hide worker failures, or mention hidden reasoning.` },
      { role: "user", content: `Original request: ${options.userRequest}\nWorker results:\n${evidence}` },
    ],
    tools: [],
  });
  if (finalResponse.kind !== "final") throw new Error("The parallel orchestrator requested an unexpected tool call.");
  options.onProgress?.({ type: "aggregation_finished" });

  return { text: finalResponse.text, tasks, results };
}

export type ParallelProgressEvent =
  | { type: "orchestrator_started" }
  | { type: "tasks_created"; tasks: ParallelTask[] }
  | { type: "worker_progress"; id: string; status?: "fulfilled" | "rejected"; error?: string }
  | { type: "worker_event"; workerId: string; event: AgentEvent }
  | { type: "aggregation_started" }
  | { type: "aggregation_finished" };

async function createParallelTasks(options: {
  complete: (request: ModelCompletionRequest) => Promise<ModelCompletionResponse>;
  userRequest: string;
  tools: ToolDefinition[];
  maxAgents: number;
  maxGenerationAttempts: number;
}): Promise<ParallelTask[]> {
  const toolSummary = options.tools.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n");
  let lastError = new Error("The orchestrator did not return valid worker tasks.");
  for (let attempt = 1; attempt <= options.maxGenerationAttempts; attempt += 1) {
    try {
      const response = await options.complete({
        messages: [
          { role: "system", content: `Split the request into independent worker subtasks. Return JSON only: {"tasks":[{"id":"worker-1","objective":"..."}]}. Use at most ${options.maxAgents} tasks. Use one task when parallel work is not genuinely useful. Never create dependent tasks.` },
          { role: "user", content: `Request: ${options.userRequest}\nAvailable tools:\n${toolSummary}` },
        ],
        tools: [],
        responseFormat: "json_object",
      });
      if (response.kind !== "final") throw new Error("The orchestrator planner requested an unexpected tool call.");
      const text = response.text;
      const parsed = JSON.parse(text) as { tasks?: unknown };
      if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0 || parsed.tasks.length > options.maxAgents) {
        throw new Error(`The orchestrator must return between 1 and ${options.maxAgents} tasks.`);
      }
      const ids = new Set<string>();
      const tasks = parsed.tasks.map((value, index) => {
        if (!value || typeof value !== "object") throw new Error(`Worker task ${index + 1} must be an object.`);
        const task = value as Record<string, unknown>;
        const id = typeof task.id === "string" ? task.id.trim() : `worker-${index + 1}`;
        const objective = typeof task.objective === "string" ? task.objective.trim() : "";
        if (!objective || ids.has(id)) throw new Error(`Worker task ${id} must have a unique id and objective.`);
        ids.add(id);
        return { id, objective };
      }).filter((task) => isUsableObjective(task.objective));
      const repairedTasks = addRequiredWorkers(tasks, options.userRequest, options.maxAgents);
      if (repairedTasks.length === 0) throw new Error("The orchestrator did not produce usable worker objectives.");
      return repairedTasks;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("The orchestrator returned an invalid task list.");
    }
  }
  throw lastError;
}

function addRequiredWorkers(
  tasks: ParallelTask[],
  request: string,
  maxAgents: number,
): ParallelTask[] {
  const normalizedRequest = request.toLowerCase();
  const requiredObjectives: string[] = [];
  if (/\b(weather|rain|raining|precipitation|forecast|umbrella)\b/u.test(normalizedRequest)) {
    requiredObjectives.push("Use get_weather to retrieve the requested weather evidence.");
  }
  if (/\b(calculate|compute|sum|multiply|divide|times|equation|expression)\b|[+*/=]/u.test(normalizedRequest)) {
    requiredObjectives.push("Use the calculator tool to evaluate the requested expression.");
  }

  const result = [...tasks];
  for (const objective of requiredObjectives) {
    const keyword = objective.includes("get_weather") ? "weather" : "calculator";
    if (result.some((task) => task.objective.toLowerCase().includes(keyword)) ||
      (keyword === "calculator" && result.some((task) => /\d\s*[+*/=-]\s*\d/u.test(task.objective)))) continue;
    if (result.length >= maxAgents) break;
    result.push({ id: `required-${keyword}`, objective: `${objective} Original request: ${request}` });
  }
  return result;
}

function isUsableObjective(objective: string): boolean {
  return objective.trim().length >= 4 && !/^[\d\s+*/=().-]+$/u.test(objective.trim());
}
