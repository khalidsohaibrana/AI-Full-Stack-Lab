import test from "node:test";
import assert from "node:assert/strict";
import { executePlan } from "./plan-executor.js";

test("executes dependent steps in order", async () => {
  const calls: string[] = [];
  const result = await executePlan({
    plan: { goal: "test", steps: [
      { id: "a", description: "first", action: "one", arguments: {}, status: "pending" },
      { id: "b", description: "second", action: "two", arguments: {}, dependsOn: ["a"], status: "pending" },
    ] },
    execute: async (call) => { calls.push(call.name); return { toolCallId: call.id, name: call.name, output: "ok" }; },
    maxStepRetries: 0,
    maxReplans: 0,
  });
  assert.deepEqual(calls, ["one", "two"]);
  assert.equal(result.results.length, 2);
});

test("retries a failed step within its configured limit", async () => {
  let attempts = 0;
  const result = await executePlan({
    plan: { goal: "test", steps: [{ id: "a", description: "retry", action: "one", arguments: {}, status: "pending" }] },
    execute: async (call) => {
      attempts += 1;
      return attempts === 1
        ? { toolCallId: call.id, name: call.name, output: { error: "temporary" }, isError: true }
        : { toolCallId: call.id, name: call.name, output: "ok" };
    },
    maxStepRetries: 1,
    maxReplans: 0,
  });
  assert.equal(attempts, 2);
  assert.equal(result.results.length, 1);
});
