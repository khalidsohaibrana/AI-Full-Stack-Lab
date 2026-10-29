import test from "node:test";
import assert from "node:assert/strict";
import {
  HandoffRouter,
  validateHandoffRequest,
  type HandoffRequest,
} from "./handoff.js";

function request(overrides: Partial<HandoffRequest> = {}): HandoffRequest {
  return {
    id: "handoff-1",
    fromAgent: "researcher",
    toAgent: "reviewer",
    reason: "The research is complete and ready for review.",
    task: "Check the findings for unsupported claims.",
    context: { findings: ["claim one"] },
    allowedActions: ["inspect", "report"],
    handoffCount: 0,
    maxHandoffs: 3,
    ...overrides,
  };
}

test("routes a valid handoff to the registered recipient", async () => {
  const router = new HandoffRouter();
  router.register("reviewer", async (handoff) => ({ reviewedTask: handoff.task }));

  const result = await router.route(request());

  assert.deepEqual(result, {
    status: "accepted",
    request: request(),
    result: { reviewedTask: "Check the findings for unsupported claims." },
  });
});

test("preserves the focused context packet instead of requiring full history", async () => {
  const router = new HandoffRouter();
  let received: HandoffRequest | undefined;
  router.register("reviewer", async (handoff) => {
    received = handoff;
    return "ok";
  });

  await router.route(request({ context: { selectedEvidence: ["only this"] } }));

  assert.deepEqual(received?.context, { selectedEvidence: ["only this"] });
});

test("rejects unknown recipients without running a handler", async () => {
  const router = new HandoffRouter();
  let called = false;
  router.register("researcher", async () => {
    called = true;
    return "unexpected";
  });

  const result = await router.route(request({ toAgent: "unknown" }));

  assert.equal(result.status, "rejected");
  assert.match(result.reason, /Unknown handoff recipient/);
  assert.equal(called, false);
});

test("rejects self-handoffs and maximum-depth loops", async () => {
  const router = new HandoffRouter();
  router.register("reviewer", async () => "unexpected");

  const selfHandoff = await router.route(request({ fromAgent: "reviewer" }));
  const maxedOut = await router.route(request({ handoffCount: 3 }));

  assert.equal(selfHandoff.status, "rejected");
  assert.match(selfHandoff.reason, /cannot hand off to itself/);
  assert.equal(maxedOut.status, "rejected");
  assert.match(maxedOut.reason, /maximum handoff limit/);
});

test("reports handler failures as rejected handoffs and emits progress", async () => {
  const router = new HandoffRouter();
  router.register("reviewer", async () => {
    throw new Error("reviewer unavailable");
  });
  const progress: string[] = [];

  const result = await router.route(request(), {
    onProgress: (event) => progress.push(event.type),
  });

  assert.equal(result.status, "rejected");
  assert.equal(result.reason, "reviewer unavailable");
  assert.deepEqual(progress, ["handoff_requested", "handoff_rejected"]);
});

test("validates required handoff fields and counters", () => {
  assert.equal(validateHandoffRequest(request()), null);
  assert.match(validateHandoffRequest(request({ task: "" })) ?? "", /requires a task/);
  assert.match(validateHandoffRequest(request({ handoffCount: -1 })) ?? "", /non-negative/);
  assert.match(validateHandoffRequest(request({ maxHandoffs: 0 })) ?? "", /positive integer/);
  assert.match(validateHandoffRequest(request({ allowedActions: [""] })) ?? "", /empty actions/);
});

test("rejects duplicate registered agent ids", () => {
  const router = new HandoffRouter();
  router.register("reviewer", async () => "ok");

  assert.throws(
    () => router.register("reviewer", async () => "again"),
    /Duplicate handoff agent id/,
  );
});
