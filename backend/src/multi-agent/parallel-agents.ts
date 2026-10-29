export type ParallelAgentTask<T> = {
  id: string;
  run: () => Promise<T>;
};

export type ParallelAgentResult<T> =
  | { id: string; status: "fulfilled"; value: T }
  | { id: string; status: "rejected"; error: string };

export type ParallelAgentProgress =
  | { type: "started"; id: string }
  | { type: "finished"; id: string; status: "fulfilled" | "rejected"; error?: string };

export async function runParallelAgents<T>(
  tasks: ParallelAgentTask<T>[],
  options: { maxConcurrency: number; onProgress?: (event: ParallelAgentProgress) => void },
): Promise<ParallelAgentResult<T>[]> {
  if (!Number.isInteger(options.maxConcurrency) || options.maxConcurrency < 1) {
    throw new Error("maxConcurrency must be a positive integer.");
  }

  const ids = new Set<string>();
  for (const task of tasks) {
    if (!task.id.trim()) throw new Error("Every parallel agent task requires an id.");
    if (ids.has(task.id)) throw new Error(`Duplicate parallel agent task id '${task.id}'.`);
    ids.add(task.id);
  }

  const results: ParallelAgentResult<T>[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      const task = tasks[index];
      if (!task) return;
      options.onProgress?.({ type: "started", id: task.id });

      try {
        results[index] = {
          id: task.id,
          status: "fulfilled",
          value: await task.run(),
        };
        options.onProgress?.({ type: "finished", id: task.id, status: "fulfilled" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results[index] = {
          id: task.id,
          status: "rejected",
          error: message,
        };
        options.onProgress?.({ type: "finished", id: task.id, status: "rejected", error: message });
      }
    }
  }

  const workerCount = Math.min(options.maxConcurrency, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
