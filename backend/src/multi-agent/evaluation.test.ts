import test from "node:test";
import assert from "node:assert/strict";
import { evaluateMultiAgentRun } from "./evaluation.js";

test("evaluates success, failure, retries, handoffs, and tool usage", () => {
  const result = evaluateMultiAgentRun({
    workers: [
      { id: "a", status: "completed", attempts: 2, toolCalls: 3 },
      { id: "b", status: "escalated", attempts: 2, toolCalls: 1 },
    ],
    handoffCount: 2,
  });
  assert.deepEqual(result, {
    workerCount: 2,
    successfulWorkers: 1,
    failedWorkers: 1,
    completionRate: 0.5,
    failureRate: 0.5,
    retryCount: 2,
    handoffCount: 2,
    toolCallCount: 4,
    averageAttempts: 2,
  });
});
