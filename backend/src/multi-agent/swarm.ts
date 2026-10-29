export type SwarmTask = { id: string; objective: string };
export type SwarmTaskState = SwarmTask & { status: "queued" | "claimed" | "completed" | "failed"; claimedBy?: string; result?: unknown; error?: string };
export type SwarmProgress =
  | { type: "task_claimed"; taskId: string; agentId: string }
  | { type: "task_completed"; taskId: string; agentId: string; result: unknown }
  | { type: "task_failed"; taskId: string; agentId: string; error: string };

export class SwarmTaskBoard {
  private readonly tasks: SwarmTaskState[];
  constructor(tasks: SwarmTask[]) {
    const ids = new Set<string>();
    for (const task of tasks) {
      if (!task.id.trim() || !task.objective.trim()) throw new Error("Every swarm task requires an id and objective.");
      if (ids.has(task.id)) throw new Error(`Duplicate swarm task id '${task.id}'.`);
      ids.add(task.id);
    }
    this.tasks = tasks.map((task) => ({ ...task, status: "queued" }));
  }
  claimNext(agentId: string): SwarmTaskState | undefined {
    const task = this.tasks.find((candidate) => candidate.status === "queued");
    if (!task) return undefined;
    task.status = "claimed";
    task.claimedBy = agentId;
    return { ...task };
  }
  complete(taskId: string, agentId: string, result: unknown): void { const task = this.owned(taskId, agentId); task.status = "completed"; task.result = result; }
  fail(taskId: string, agentId: string, error: string): void { const task = this.owned(taskId, agentId); task.status = "failed"; task.error = error; }
  snapshot(): SwarmTaskState[] { return this.tasks.map((task) => ({ ...task })); }
  private owned(taskId: string, agentId: string): SwarmTaskState { const task = this.tasks.find((candidate) => candidate.id === taskId); if (!task) throw new Error(`Unknown swarm task '${taskId}'.`); if (task.status !== "claimed" || task.claimedBy !== agentId) throw new Error(`Agent '${agentId}' does not own swarm task '${taskId}'.`); return task; }
}

export async function runSwarm<T>(
  tasks: SwarmTask[],
  options: { agentIds: string[]; run: (task: SwarmTaskState, agentId: string) => Promise<T>; onProgress?: (event: SwarmProgress) => void },
): Promise<SwarmTaskState[]> {
  if (options.agentIds.length === 0) throw new Error("agentIds must contain at least one agent.");
  const board = new SwarmTaskBoard(tasks);
  async function agent(agentId: string): Promise<void> {
    while (true) {
      const task = board.claimNext(agentId);
      if (!task) return;
      options.onProgress?.({ type: "task_claimed", taskId: task.id, agentId });
      try {
        const result = await options.run(task, agentId);
        board.complete(task.id, agentId, result);
        options.onProgress?.({ type: "task_completed", taskId: task.id, agentId, result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        board.fail(task.id, agentId, message);
        options.onProgress?.({ type: "task_failed", taskId: task.id, agentId, error: message });
      }
    }
  }
  await Promise.all(options.agentIds.map((agentId) => agent(agentId)));
  return board.snapshot();
}
