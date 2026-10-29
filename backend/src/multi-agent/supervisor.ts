export type SupervisorTask = { id: string; objective: string };

export type SupervisorAttempt<T> = {
  taskId: string;
  workerId: string;
  attempt: number;
  status: "fulfilled" | "failed";
  value?: T;
  error?: string;
};

export type SupervisorProgress<T> =
  | { type: "supervisor_started"; taskCount: number }
  | { type: "worker_started"; task: SupervisorTask; workerId: string; attempt: number }
  | { type: "worker_finished"; attempt: SupervisorAttempt<T> }
  | { type: "worker_retrying"; task: SupervisorTask; nextAttempt: number; reason: string }
  | { type: "worker_escalated"; task: SupervisorTask; reason: string }
  | { type: "supervisor_finished"; completed: number; escalated: number };

export type SupervisorTaskResult<T> =
  | { task: SupervisorTask; status: "completed"; value: T; attempts: SupervisorAttempt<T>[] }
  | { task: SupervisorTask; status: "escalated"; error: string; attempts: SupervisorAttempt<T>[] };

export async function runSupervisor<T>(
  tasks: SupervisorTask[],
  options: {
    maxRetries: number;
    workerIds: string[];
    run: (task: SupervisorTask, workerId: string, attempt: number) => Promise<T>;
    onProgress?: (event: SupervisorProgress<T>) => void;
  },
): Promise<SupervisorTaskResult<T>[]> {
  validateSupervisorOptions(tasks, options);
  options.onProgress?.({ type: "supervisor_started", taskCount: tasks.length });

  const results: SupervisorTaskResult<T>[] = [];
  for (const task of tasks) {
    const attempts: SupervisorAttempt<T>[] = [];
    let completed: SupervisorTaskResult<T> | undefined;
    for (let attempt = 1; attempt <= options.maxRetries + 1; attempt += 1) {
      const workerId = options.workerIds[(attempt - 1) % options.workerIds.length]!;
      options.onProgress?.({ type: "worker_started", task, workerId, attempt });
      try {
        const value = await options.run(task, workerId, attempt);
        const record: SupervisorAttempt<T> = { taskId: task.id, workerId, attempt, status: "fulfilled", value };
        attempts.push(record);
        options.onProgress?.({ type: "worker_finished", attempt: record });
        completed = { task, status: "completed", value, attempts };
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const record: SupervisorAttempt<T> = { taskId: task.id, workerId, attempt, status: "failed", error: message };
        attempts.push(record);
        options.onProgress?.({ type: "worker_finished", attempt: record });
        if (attempt <= options.maxRetries) {
          options.onProgress?.({ type: "worker_retrying", task, nextAttempt: attempt + 1, reason: message });
        } else {
          options.onProgress?.({ type: "worker_escalated", task, reason: message });
          completed = { task, status: "escalated", error: message, attempts };
        }
      }
    }
    if (completed) results.push(completed);
  }

  options.onProgress?.({
    type: "supervisor_finished",
    completed: results.filter((result) => result.status === "completed").length,
    escalated: results.filter((result) => result.status === "escalated").length,
  });
  return results;
}

function validateSupervisorOptions<T>(tasks: SupervisorTask[], options: { maxRetries: number; workerIds: string[]; run: (task: SupervisorTask, workerId: string, attempt: number) => Promise<T> }): void {
  if (!Number.isInteger(options.maxRetries) || options.maxRetries < 0) throw new Error("maxRetries must be a non-negative integer.");
  if (options.workerIds.length === 0 || options.workerIds.some((id) => !id.trim())) throw new Error("workerIds must contain at least one non-empty id.");
  const ids = new Set<string>();
  for (const task of tasks) {
    if (!task.id.trim() || !task.objective.trim()) throw new Error("Every supervisor task requires an id and objective.");
    if (ids.has(task.id)) throw new Error(`Duplicate supervisor task id '${task.id}'.`);
    ids.add(task.id);
  }
}
