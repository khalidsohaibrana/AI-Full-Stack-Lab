import assert from "node:assert/strict";
import test from "node:test";
import { AgentLoopError, runAgent } from "./agent-loop.js";
import type { ModelCompletionResponse } from "./types.js";

const tools = [
  {
    name: "calculator",
    description: "Calculate.",
    parameters: { type: "object" },
  },
];

test("returns a final model response without using tools", async () => {
  const result = await runAgent({
    messages: [{ role: "user", content: "Hello" }],
    tools,
    complete: async () => ({ kind: "final", text: "Hi there." }),
    execute: async () => {
      throw new Error("should not execute");
    },
    maxIterations: 3,
    maxToolCalls: 3,
  });

  assert.equal(result.text, "Hi there.");
  assert.equal(result.iterations, 1);
  assert.deepEqual(result.events.at(-1), { type: "finished", iterations: 1 });
});

test("executes a tool and continues with its result", async () => {
  let calls = 0;
  const responses: ModelCompletionResponse[] = [
    {
      kind: "tool_calls",
      message: {
        role: "assistant",
        content: null,
        toolCalls: [{ id: "call_1", name: "calculator", arguments: { expression: "2 + 2" } }],
      },
      calls: [{ id: "call_1", name: "calculator", arguments: { expression: "2 + 2" } }],
    },
    { kind: "final", text: "The answer is 4." },
  ];

  const result = await runAgent({
    messages: [{ role: "user", content: "What is 2 + 2?" }],
    tools,
    complete: async () => responses[calls++]!,
    execute: async (call) => ({
      toolCallId: call.id,
      name: call.name,
      output: { result: 4 },
    }),
    maxIterations: 3,
    maxToolCalls: 3,
  });

  assert.equal(result.text, "The answer is 4.");
  assert.equal(result.iterations, 2);
  assert.equal(result.messages.at(-1)?.role, "tool");
  assert.equal(result.events.filter((event) => event.type === "tool_selected").length, 1);
});

test("falls back to a direct answer when the model requests an unavailable tool", async () => {
  const requests: Array<{ toolCount: number; messages: string }> = [];
  let calls = 0;

  const result = await runAgent({
    messages: [{ role: "user", content: "Do you have web search?" }],
    tools,
    complete: async (request) => {
      requests.push({
        toolCount: request.tools.length,
        messages: request.messages.map((message) => message.content ?? "").join("\n"),
      });
      calls += 1;
      if (calls === 1) {
        return {
          kind: "tool_calls",
          message: { role: "assistant", content: null },
          calls: [{ id: "call_unknown", name: "web_search", arguments: { query: "web search" } }],
        };
      }
      return { kind: "final", text: "No, web search is not available in this application." };
    },
    execute: async (call) => ({
      toolCallId: call.id,
      name: call.name,
      output: { error: `Unknown tool: ${call.name}` },
      isError: true,
    }),
    maxIterations: 5,
    maxToolCalls: 5,
  });

  assert.equal(result.text, "No, web search is not available in this application.");
  assert.deepEqual(requests.map((request) => request.toolCount), [1, 0]);
  assert.match(requests[1]?.messages ?? "", /not available in this application/);
});

test("stops when the iteration limit is reached", async () => {
  await assert.rejects(
    () =>
      runAgent({
        messages: [{ role: "user", content: "Keep going" }],
        tools,
        complete: async () => ({
          kind: "tool_calls",
          message: { role: "assistant", content: null },
          calls: [{ id: "call_1", name: "calculator", arguments: {} }],
        }),
        execute: async (call) => ({ toolCallId: call.id, name: call.name, output: {} }),
        maxIterations: 1,
        maxToolCalls: 3,
      }),
    (error) => error instanceof AgentLoopError && error.code === "max_iterations",
  );
});

test("stops when the tool-call limit is reached", async () => {
  await assert.rejects(
    () =>
      runAgent({
        messages: [{ role: "user", content: "Use tools" }],
        tools,
        complete: async () => ({
          kind: "tool_calls",
          message: { role: "assistant", content: null },
          calls: [
            { id: "call_1", name: "calculator", arguments: {} },
            { id: "call_2", name: "calculator", arguments: {} },
          ],
        }),
        execute: async (call) => ({ toolCallId: call.id, name: call.name, output: {} }),
        maxIterations: 3,
        maxToolCalls: 1,
      }),
    (error) => error instanceof AgentLoopError && error.code === "max_tool_calls",
  );
});
