# Part 4: Planning

Part 4 adds an explicit planning path beside the direct reactive agent loop.
The direct loop asks the model what to do next. The planning path first creates
a bounded structured plan, validates it, executes its tool steps, and can ask
the planner for a revised plan after a failed step.

```text
request -> planner -> validator -> executor -> tool results -> final answer
                         ^                         |
                         └────── replanner ────────┘
```

## Implemented

- Provider-neutral `Plan` and `PlanStep` contracts
- JSON-only planner prompt through the existing model adapter
- Validation for missing fields, unknown tools, duplicate IDs, invalid
  dependencies, dependency cycles, and maximum step count
- Sequential plan executor using the existing tool registry
- Per-step retries and bounded replanning
- Plan and step status metadata in the chat response
- Frontend `Direct loop` / `Plan first` switch
- Frontend plan visibility without exposing hidden chain-of-thought

Planning is opt-in from the UI and request body so the reactive loop remains
available for comparison:

```json
{
  "planning": true,
  "messages": [{ "role": "user", "content": "Use the calculator to calculate 18 * 7" }]
}
```

Configuration:

```env
AI_PLANNING_ENABLED=false
AI_PLANNER_MAX_STEPS=8
AI_PLANNER_MAX_REPLANS=2
AI_PLANNER_MAX_STEP_RETRIES=1
AI_PLANNER_MAX_GENERATION_ATTEMPTS=2
```

`AI_PLANNING_ENABLED` controls the default. A request can explicitly set
`planning: true` or `planning: false` to override that default.

## Safety boundary

The model is not trusted to invent executable actions. The validator checks
every action against the registered tool names before execution. A model can
still produce a poor plan, but unknown tools and invalid dependency graphs are
rejected before they can run.

The UI shows goal, step descriptions, statuses, tool names, failures, and
replan counts. It does not display hidden chain-of-thought.

## Limitations for the next planning milestone

- Current execution is sequential, not parallel.
- Steps cannot yet reference previous step output with explicit variables.
- Replanning is model-generated but not persisted as a checkpoint.
- The planner uses the same chat model; a separate planner model is a future
  provider configuration option.
