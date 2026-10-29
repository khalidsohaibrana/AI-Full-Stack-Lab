# Part 5: Multi-agent systems

This part introduces multiple agents without using an orchestration framework.

## Learning sequence

1. Parallel agents: run independent workers concurrently and aggregate results.
2. Orchestrator and subagents: one agent delegates focused tasks to workers.
3. Agent handoff: transfer a task and its context between specialized agents.
4. Supervisor agents: monitor workers, retry failures, and decide when work is complete.
5. Swarm agents: coordinate peer-to-peer without a central planner.

## Implemented: parallel agents

`runParallelAgents` is the runtime primitive for independent workers. It provides:

- bounded concurrency
- stable result ordering
- per-agent success or failure status
- failure isolation
- duplicate-ID validation

The LLM orchestrator now creates provider-neutral worker tasks, runs them concurrently, aggregates their results, and streams execution progress to the frontend.

## Implemented: agent handoff foundation

`HandoffRouter` transfers a focused task packet from one specialized agent to another.
The contract includes:

- sending and receiving agent ids
- reason and focused task
- selected context instead of the full conversation
- allowed actions
- current handoff count and maximum handoff limit

The router rejects self-handoffs, unknown recipients, invalid packets, duplicate agent registration, and handoff-depth loops. Recipient failures are returned as rejected results so the caller can decide whether to retry, escalate, or answer the user.

## Implemented: model-backed handoff workflow

The chat API now supports `handoff: true`. The workflow is deliberately sequential:

```text
lead -> researcher -> reviewer -> lead
```

The researcher and reviewer are ordinary agent loops with different role instructions. They receive a focused handoff packet, may use the registered tools, and return a report. The lead receives both reports and writes the final answer.

Use the **Handoff agents** toggle in the frontend, or call the API directly:

```json
{
  "messages": [{"role": "user", "content": "Explain how semantic memory improves an agent."}],
  "handoff": true,
  "stream": true
}
```

The SSE trace exposes `handoff_requested`, `handoff_accepted`, `handoff_worker_event`, and `handoff_rejected` events. The completed response includes `handoff.workers` with each specialist's iterations and tool calls.

## Implemented: supervisor agents

`runSupervisor` observes each worker attempt and makes an explicit control-flow decision:

```text
worker starts -> succeeds
             -> fails -> retry with another worker -> succeeds
                                      -> fails -> escalate
```

The supervisor records attempts, rotates worker ids, emits retry/escalation events, and produces a final summary that discloses failures. This is different from the orchestrator: the orchestrator creates work; the supervisor manages reliability while work is running.

The chat API supports `supervisor: true`, and the frontend exposes a **Supervisor** mode. Its trace shows task assignment, attempts, retries, and escalations.

## Implemented: swarm foundation

`SwarmTaskBoard` and `runSwarm` let peer agents claim queued tasks from shared state. There is no lead agent assigning every task. Ownership is checked before completion, so one peer cannot complete another peer's task. This teaches the core swarm trade-off: autonomy increases, but shared-state and conflict rules become essential.

## Implemented: multi-agent evaluation

`evaluateMultiAgentRun` calculates completion rate, failure rate, retries, handoffs, tool calls, and average attempts. These metrics let us compare a direct agent, a parallel orchestrator, a supervisor, and a swarm using evidence instead of intuition.

## Part 5 teaching diagrams

### Parallel agents: independent work

```text
                    ┌─ worker A ─┐
user request ────────┼─ worker B ─┼── aggregate ── final answer
                    └─ worker C ─┘
```

Use parallel agents when tasks do not depend on one another. The benefit is
latency reduction; the cost is aggregation and isolated failure handling.

### Handoff: ownership transfer

```text
lead ── focused context ──▶ researcher
                              │
                              └── evidence ──▶ reviewer ──▶ lead
```

Use handoff when the next agent needs the previous agent's result. The benefit
is specialization; the cost is sequential latency and context-transfer errors.

### Supervisor: reliability control

```text
                 ┌──── success ────▶ completed
supervisor ──────┤
                 └──── failure ────▶ retry ───▶ escalate to human
```

Use a supervisor when work can fail and the system must decide what happens
next. The supervisor does not do every task; it manages attempts, retries, and
escalations.

### Swarm: shared peer coordination

```text
       peer A ───┐
       peer B ───┼── shared task board ── completed work
       peer C ───┘
```

Use a swarm when peers can autonomously claim work. The benefit is flexibility;
the cost is coordination: ownership, duplicate work, conflicts, and shared
state become the system's responsibility.

### Choosing the pattern

```text
Are tasks independent?
  ├─ yes → parallel agents
  └─ no
      Does responsibility move between specialists?
        ├─ yes → handoff
        └─ no
            Can workers fail and need recovery decisions?
              ├─ yes → supervisor
              └─ no
                  Can peers claim work from shared state?
                    ├─ yes → swarm
                    └─ no → direct agent loop
```

Part 5 is complete as a provider-neutral learning implementation: parallel
workers, orchestration, handoff, supervision, swarm coordination, and
evaluation are implemented with tests. The next phase is production hardening:
timeouts, human approval, checkpointing, long-running jobs, and cost control.
