export type MultiAgentEvaluationInput = {
  workers: Array<{ id: string; status: "fulfilled" | "rejected" | "completed" | "escalated"; attempts?: number; toolCalls?: number }>;
  handoffCount?: number;
  retryCount?: number;
};

export type MultiAgentEvaluation = {
  workerCount: number;
  successfulWorkers: number;
  failedWorkers: number;
  completionRate: number;
  failureRate: number;
  retryCount: number;
  handoffCount: number;
  toolCallCount: number;
  averageAttempts: number;
};

export function evaluateMultiAgentRun(input: MultiAgentEvaluationInput): MultiAgentEvaluation {
  const successfulWorkers = input.workers.filter((worker) => worker.status === "fulfilled" || worker.status === "completed").length;
  const failedWorkers = input.workers.length - successfulWorkers;
  const attempts = input.workers.reduce((total, worker) => total + (worker.attempts ?? 1), 0);
  return {
    workerCount: input.workers.length,
    successfulWorkers,
    failedWorkers,
    completionRate: ratio(successfulWorkers, input.workers.length),
    failureRate: ratio(failedWorkers, input.workers.length),
    retryCount: input.retryCount ?? Math.max(0, attempts - input.workers.length),
    handoffCount: input.handoffCount ?? 0,
    toolCallCount: input.workers.reduce((total, worker) => total + (worker.toolCalls ?? 0), 0),
    averageAttempts: input.workers.length === 0 ? 0 : Number((attempts / input.workers.length).toFixed(2)),
  };
}

function ratio(value: number, total: number): number { return total === 0 ? 0 : Number((value / total).toFixed(3)); }
