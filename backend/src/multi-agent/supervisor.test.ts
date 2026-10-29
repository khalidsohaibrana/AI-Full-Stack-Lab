import test from "node:test";
import assert from "node:assert/strict";
import { runSupervisor } from "./supervisor.js";

test("supervisor retries a failed worker and can replace it", async () => {
  const attempts: string[] = [];
  const events: string[] = [];
  const results = await runSupervisor([{ id: "task-1", objective: "research" }], {
    maxRetries: 1,
    workerIds: ["worker-a", "worker-b"],
    run: async (_task, workerId, attempt) => {
      attempts.push(`${workerId}:${attempt}`);
      if (attempt === 1) throw new Error("temporary failure");
      return "completed";
    },
    onProgress: (event) => events.push(event.type),
  });
  assert.deepEqual(attempts, ["worker-a:1", "worker-b:2"]);
  assert.equal(results[0]?.status, "completed");
  assert.deepEqual(events, ["supervisor_started", "worker_started", "worker_finished", "worker_retrying", "worker_started", "worker_finished", "supervisor_finished"]);
});

test("supervisor escalates after retries are exhausted", async () => {
  const results = await runSupervisor([{ id: "task-1", objective: "review" }], {
    maxRetries: 2,
    workerIds: ["worker-a"],
    run: async () => { throw new Error("permanent failure"); },
  });
  assert.equal(results[0]?.status, "escalated");
  assert.equal(results[0]?.attempts.length, 3);
});
