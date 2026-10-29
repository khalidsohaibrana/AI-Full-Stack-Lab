import test from "node:test";
import assert from "node:assert/strict";
import { runParallelAgents } from "./parallel-agents.js";

test("runs independent agents concurrently up to the configured limit", async () => {
  let active = 0;
  let peak = 0;
  const tasks = Array.from({ length: 4 }, (_, index) => ({
    id: `agent-${index + 1}`,
    run: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return index + 1;
    },
  }));

  const results = await runParallelAgents(tasks, { maxConcurrency: 2 });

  assert.equal(peak, 2);
  assert.deepEqual(results, [
    { id: "agent-1", status: "fulfilled", value: 1 },
    { id: "agent-2", status: "fulfilled", value: 2 },
    { id: "agent-3", status: "fulfilled", value: 3 },
    { id: "agent-4", status: "fulfilled", value: 4 },
  ]);
});

test("isolates failures and preserves result order", async () => {
  const results = await runParallelAgents(
    [
      { id: "first", run: async () => "ok" },
      { id: "second", run: async () => { throw new Error("worker failed"); } },
      { id: "third", run: async () => "still ran" },
    ],
    { maxConcurrency: 3 },
  );

  assert.deepEqual(results, [
    { id: "first", status: "fulfilled", value: "ok" },
    { id: "second", status: "rejected", error: "worker failed" },
    { id: "third", status: "fulfilled", value: "still ran" },
  ]);
});

test("rejects invalid concurrency and duplicate task IDs", async () => {
  await assert.rejects(
    () => runParallelAgents([], { maxConcurrency: 0 }),
    /maxConcurrency must be a positive integer/,
  );
  await assert.rejects(
    () => runParallelAgents([
      { id: "same", run: async () => 1 },
      { id: "same", run: async () => 2 },
    ], { maxConcurrency: 2 }),
    /Duplicate parallel agent task id/,
  );
});
