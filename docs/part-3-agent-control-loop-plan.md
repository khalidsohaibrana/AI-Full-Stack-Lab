# Part 3: Agent Control Loop

Part 3 introduces agency without using LangChain, LangGraph, or another agent
framework. The backend will own the loop that connects model decisions to
validated application functions.

## Progress

- [x] Phase 1: provider-neutral tool contract
- [x] Phase 2: tool registry
- [x] Phase 3: model tool-call request and response parsing
- [x] Phase 4: argument validation and tool execution
- [x] Phase 5: tool-result messages and multi-step loop
- [x] Phase 6: iteration limits and failure handling
- [x] Phase 7: frontend execution metadata

All Part 3 phases are implemented on the feature branch. The phases remain
listed so each responsibility can be revisited during learning and revision.

## Phase 1: Tool contract

The contract separates the concepts that later providers may represent
differently:

- `ToolDefinition` describes a tool to a model.
- `ToolCall` represents the model's requested action.
- `ToolResult` represents the backend's result.
- `Tool` combines a definition with an application-owned `execute` function.
- `ToolExecutionContext` carries request-scoped information without coupling
  tools to Express or a model SDK.

Phase 1 only defines and validates these boundaries. It deliberately does not
register, execute, or loop over tools yet.

## Target control flow

```text
user message
  -> model receives tool definitions
  -> model returns a final answer or a ToolCall
  -> backend validates the ToolCall
  -> backend executes a registered Tool
  -> backend appends a ToolResult
  -> model receives the result and continues
```

## Guardrails

- Keep tools independent from Express and provider SDKs.
- Validate tool names and call envelopes before execution.
- Treat model-generated arguments as untrusted input.
- Add an explicit maximum iteration count before enabling multi-step loops.
- Keep tool execution metadata observable to the frontend.
