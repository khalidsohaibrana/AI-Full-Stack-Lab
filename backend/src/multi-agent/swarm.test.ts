import test from "node:test";
import assert from "node:assert/strict";
import { SwarmTaskBoard, runSwarm } from "./swarm.js";

test("swarm agents claim each task once and share work through the board", async () => {
  const claimed: string[] = [];
  const result = await runSwarm(
    ["one", "two", "three"].map((id) => ({ id, objective: id })),
    {
      agentIds: ["agent-a", "agent-b"],
      run: async (task, agentId) => {
        claimed.push(`${task.id}:${agentId}`);
        return `${agentId} completed ${task.id}`;
      },
    },
  );
  assert.equal(new Set(claimed.map((item) => item.split(":")[0])).size, 3);
  assert.equal(result.filter((task) => task.status === "completed").length, 3);
});

test("swarm board prevents an agent from completing another agent's task", () => {
  const board = new SwarmTaskBoard([{ id: "one", objective: "one" }]);
  board.claimNext("agent-a");
  assert.throws(() => board.complete("one", "agent-b", "bad"), /does not own/);
});
