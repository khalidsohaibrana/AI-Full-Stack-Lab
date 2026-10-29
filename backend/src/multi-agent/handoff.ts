import type { AgentEvent } from "../agent/types.js";

export type HandoffContext = Record<string, unknown>;

export type HandoffRequest = {
  id: string;
  fromAgent: string;
  toAgent: string;
  reason: string;
  task: string;
  context: HandoffContext;
  allowedActions: string[];
  handoffCount: number;
  maxHandoffs: number;
};

export type HandoffAccepted = {
  status: "accepted";
  request: HandoffRequest;
  result: unknown;
};

export type HandoffRejected = {
  status: "rejected";
  request: HandoffRequest;
  reason: string;
};

export type HandoffResult = HandoffAccepted | HandoffRejected;

export type HandoffProgress =
  | { type: "handoff_requested"; request: HandoffRequest }
  | { type: "handoff_accepted"; request: HandoffRequest }
  | { type: "handoff_rejected"; request: HandoffRequest; reason: string }
  | { type: "handoff_worker_event"; workerId: string; event: AgentEvent };

export type HandoffHandler = (request: HandoffRequest) => Promise<unknown>;

export class HandoffRouter {
  private readonly handlers = new Map<string, HandoffHandler>();

  register(agentId: string, handler: HandoffHandler): void {
    const normalizedAgentId = agentId.trim();
    if (!normalizedAgentId) throw new Error("A handoff agent requires an id.");
    if (this.handlers.has(normalizedAgentId)) {
      throw new Error(`Duplicate handoff agent id '${normalizedAgentId}'.`);
    }
    this.handlers.set(normalizedAgentId, handler);
  }

  async route(
    request: HandoffRequest,
    options: { onProgress?: (event: HandoffProgress) => void } = {},
  ): Promise<HandoffResult> {
    const validationError = validateHandoffRequest(request);
    options.onProgress?.({ type: "handoff_requested", request });
    if (validationError) {
      options.onProgress?.({ type: "handoff_rejected", request, reason: validationError });
      return { status: "rejected", request, reason: validationError };
    }

    const handler = this.handlers.get(request.toAgent);
    if (!handler) {
      const reason = `Unknown handoff recipient '${request.toAgent}'.`;
      options.onProgress?.({ type: "handoff_rejected", request, reason });
      return { status: "rejected", request, reason };
    }

    try {
      const result = await handler(request);
      options.onProgress?.({ type: "handoff_accepted", request });
      return { status: "accepted", request, result };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      options.onProgress?.({ type: "handoff_rejected", request, reason });
      return { status: "rejected", request, reason };
    }
  }
}

export function validateHandoffRequest(request: HandoffRequest): string | null {
  if (!request.id.trim()) return "A handoff requires an id.";
  if (!request.fromAgent.trim()) return "A handoff requires a sending agent.";
  if (!request.toAgent.trim()) return "A handoff requires a receiving agent.";
  if (request.fromAgent === request.toAgent) return "An agent cannot hand off to itself.";
  if (!request.reason.trim()) return "A handoff requires a reason.";
  if (!request.task.trim()) return "A handoff requires a task.";
  if (!Number.isInteger(request.handoffCount) || request.handoffCount < 0) {
    return "handoffCount must be a non-negative integer.";
  }
  if (!Number.isInteger(request.maxHandoffs) || request.maxHandoffs < 1) {
    return "maxHandoffs must be a positive integer.";
  }
  if (request.handoffCount >= request.maxHandoffs) {
    return "The maximum handoff limit has been reached.";
  }
  if (!Array.isArray(request.allowedActions)) return "allowedActions must be an array.";
  if (request.allowedActions.some((action) => !action.trim())) {
    return "allowedActions cannot contain empty actions.";
  }
  return null;
}
