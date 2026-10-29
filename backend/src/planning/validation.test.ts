import test from "node:test";
import assert from "node:assert/strict";
import { validatePlan } from "./validation.js";

const tools = ["get_weather", "calculator"];

test("validates a plan and normalizes step status", () => {
  const plan = validatePlan({ goal: "Check weather", steps: [{ id: "step-1", description: "Get weather", action: "get_weather", arguments: { location: "Lahore" } }] }, tools, 4);
  assert.equal(plan.steps[0]?.status, "pending");
});

test("rejects unknown tools and dependency cycles", () => {
  assert.throws(() => validatePlan({ goal: "x", steps: [{ id: "a", description: "x", action: "missing", arguments: {} }] }, tools, 4), /unknown tool/);
  assert.throws(() => validatePlan({ goal: "x", steps: [{ id: "a", description: "x", action: "calculator", arguments: {}, dependsOn: ["b"] }, { id: "b", description: "x", action: "calculator", arguments: {}, dependsOn: ["a"] }] }, tools, 4), /cycle/);
});
