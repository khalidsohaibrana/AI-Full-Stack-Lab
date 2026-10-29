# Part 5: Multi-agent systems

This part introduces multiple independent agents without using an orchestration framework.

## Learning sequence

1. Parallel agents: run independent workers concurrently and aggregate results.
2. Orchestrator and subagents: one agent delegates focused tasks to workers.
3. Agent handoff: transfer a task and its context between specialized agents.
4. Supervisor agents: monitor workers, retry failures, and decide when work is complete.
5. Swarm agents: coordinate peer-to-peer without a central planner.

## First implementation

`runParallelAgents` is the runtime primitive for independent workers. It provides:

- bounded concurrency
- stable result ordering
- per-agent success or failure status
- failure isolation
- duplicate-ID validation

The next increment will connect this primitive to an LLM orchestrator that creates provider-neutral worker tasks.
