import test from "node:test";
import assert from "node:assert/strict";
import { runHandoffOrchestrator } from "./handoff-orchestrator.js";
import type { ModelCompletionRequest, ModelCompletionResponse } from "../agent/types.js";

test("runs researcher then reviewer and gives both reports to the lead", async () => {
  const requests: ModelCompletionRequest[] = [];
  const progress: string[] = [];
  const complete = async (request: ModelCompletionRequest): Promise<ModelCompletionResponse> => {
    requests.push(request);
    const system = request.messages.find((message) => message.role === "system")?.content ?? "";
    if (system.includes("You are the lead agent")) return { kind: "final", text: "Final answer from the lead." };
    if (system.includes("You are the researcher")) return { kind: "final", text: "Research report." };
    return { kind: "final", text: "Review report." };
  };

  const result = await runHandoffOrchestrator({
    complete,
    userRequest: "Explain why context windows matter.",
    baseMessages: [{ role: "user", content: "Explain why context windows matter." }],
    instructions: "Be precise.",
    tools: [],
    execute: async () => ({ toolCallId: "unused", name: "unused", output: "unused", isError: false }),
    maxIterations: 2,
    maxToolCalls: 2,
    onProgress: (event) => progress.push(event.type),
  });

  assert.equal(result.text, "Final answer from the lead.");
  assert.deepEqual(result.workers.map((worker) => worker.id), ["researcher", "reviewer"]);
  assert.deepEqual(progress.filter((type) => type === "handoff_requested"), [
    "handoff_requested",
    "handoff_requested",
  ]);
  assert.equal(progress.filter((type) => type === "handoff_accepted").length, 2);
  const reviewerPrompt = requests.find((request) =>
    request.messages.some((message) => message.role === "user" && message.content.includes("Research report.")),
  );
  assert.ok(reviewerPrompt);
  const leadPrompt = requests.at(-1);
  assert.ok(leadPrompt);
  assert.match(leadPrompt?.messages.at(-1)?.content ?? "", /Review report/);
});

test("exposes worker tool calls through handoff metadata", async () => {
  let researchToolCallIssued = false;
  const complete = async (request: ModelCompletionRequest): Promise<ModelCompletionResponse> => {
    const system = request.messages.find((message) => message.role === "system")?.content ?? "";
    if (system.includes("You are the researcher") && !researchToolCallIssued) {
      researchToolCallIssued = true;
      return {
        kind: "tool_calls",
        message: { role: "assistant", content: null, toolCalls: [{ id: "call-1", name: "learn", arguments: {} }] },
        calls: [{ id: "call-1", name: "learn", arguments: {} }],
      };
    }
    if (system.includes("reviewer")) return { kind: "final", text: "Reviewed." };
    return { kind: "final", text: "Done." };
  };
  const result = await runHandoffOrchestrator({
    complete,
    userRequest: "Learn the concept.",
    baseMessages: [{ role: "user", content: "Learn the concept." }],
    instructions: "Be precise.",
    tools: [{ name: "learn", description: "Learn", parameters: { type: "object", properties: {} } }],
    execute: async (call) => ({ toolCallId: call.id, name: call.name, output: { learned: true }, isError: false }),
    maxIterations: 2,
    maxToolCalls: 2,
  });

  assert.equal(result.workers[0]?.result.events.some((event) => event.type === "tool_selected"), true);
});
