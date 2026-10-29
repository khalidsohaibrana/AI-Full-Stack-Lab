import test from "node:test";
import assert from "node:assert/strict";
import { runSupervisorOrchestrator } from "./supervisor-orchestrator.js";
import type { ModelCompletionRequest, ModelCompletionResponse } from "../agent/types.js";

test("supervisor orchestrator plans tasks, runs workers, and summarizes failures", async () => {
  const complete = async (request: ModelCompletionRequest): Promise<ModelCompletionResponse> => {
    const system = request.messages.find((message) => message.role === "system")?.content ?? "";
    if (request.responseFormat === "json_object") return { kind: "final", text: '{"tasks":[{"id":"research","objective":"Research the topic"}]}' };
    if (system.includes("supervisor summarizing")) return { kind: "final", text: "Supervisor summary." };
    return { kind: "final", text: "Worker report." };
  };
  const result = await runSupervisorOrchestrator({
    complete,
    userRequest: "Explain agent memory.",
    baseMessages: [{ role: "user", content: "Explain agent memory." }],
    instructions: "Be concise.",
    tools: [],
    execute: async (call) => ({ toolCallId: call.id, name: call.name, output: {} }),
    maxIterations: 2,
    maxToolCalls: 2,
    maxRetries: 1,
    maxAgents: 2,
  });
  assert.equal(result.text, "Supervisor summary.");
  assert.equal(result.results[0]?.status, "completed");
  assert.equal(result.events.filter((event) => event.type === "worker_started").length, 1);
});
