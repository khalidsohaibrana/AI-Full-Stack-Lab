import type { Plan } from "./types.js";

export function validatePlan(
  value: unknown,
  knownToolNames: string[],
  maxSteps: number,
): Plan {
  if (!value || typeof value !== "object") {
    throw new Error("Planner output must be an object.");
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.goal !== "string" || candidate.goal.trim().length === 0) {
    throw new Error("Planner output must contain a non-empty goal.");
  }
  if (!Array.isArray(candidate.steps) || candidate.steps.length === 0) {
    throw new Error("Planner output must contain at least one step.");
  }
  if (candidate.steps.length > maxSteps) {
    throw new Error(`Planner output exceeded the maximum of ${maxSteps} steps.`);
  }

  const ids = new Set<string>();
  const steps = candidate.steps.map((rawStep, index) => {
    if (!rawStep || typeof rawStep !== "object") {
      throw new Error(`Plan step ${index + 1} must be an object.`);
    }
    const step = rawStep as Record<string, unknown>;
    const id = typeof step.id === "string" ? step.id.trim() : "";
    const description = typeof step.description === "string" ? step.description.trim() : "";
    const action = typeof step.action === "string" ? step.action.trim() : "";
    if (!id || ids.has(id)) throw new Error(`Plan step ${index + 1} has a duplicate or empty id.`);
    if (!description) throw new Error(`Plan step ${id} must have a description.`);
    if (!knownToolNames.includes(action)) throw new Error(`Plan step ${id} uses unknown tool '${action}'.`);
    if (step.arguments === undefined) throw new Error(`Plan step ${id} must include arguments.`);
    const dependsOn = step.dependsOn === undefined ? [] : step.dependsOn;
    if (!Array.isArray(dependsOn) || !dependsOn.every((dependency) => typeof dependency === "string")) {
      throw new Error(`Plan step ${id} has invalid dependencies.`);
    }
    ids.add(id);
    return { id, description, action, arguments: step.arguments, dependsOn, status: "pending" as const };
  });

  for (const step of steps) {
    for (const dependency of step.dependsOn ?? []) {
      if (!ids.has(dependency) || dependency === step.id) {
        throw new Error(`Plan step ${step.id} has an invalid dependency '${dependency}'.`);
      }
    }
  }

  assertAcyclic(steps);
  return { goal: candidate.goal.trim(), steps };
}

function assertAcyclic(steps: Plan["steps"]): void {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string): void {
    if (visiting.has(id)) throw new Error("Plan dependencies contain a cycle.");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const step of steps) visit(step.id);
}
