import type { ToolCall, ToolResult } from "../tools/types.js";
import type { Plan, PlanExecutionResult, PlanningEvent } from "./types.js";

export async function executePlan(options: {
  plan: Plan;
  execute: (call: ToolCall) => Promise<ToolResult>;
  maxStepRetries: number;
  replan?: (failedPlan: Plan, error: string, results: PlanExecutionResult["results"]) => Promise<Plan>;
  maxReplans: number;
}): Promise<PlanExecutionResult> {
  let plan = clonePlan(options.plan);
  const results: PlanExecutionResult["results"] = [];
  const events: PlanningEvent[] = [{ type: "plan_created", goal: plan.goal, stepCount: plan.steps.length }];
  let replans = 0;

  while (true) {
    const pending = plan.steps.find((step) => step.status === "pending");
    if (!pending) return { plan, results, events, replans };
    const dependenciesComplete = (pending.dependsOn ?? []).every((id) =>
      plan.steps.find((step) => step.id === id)?.status === "completed",
    );
    if (!dependenciesComplete) {
      throw new Error(`Plan step ${pending.id} cannot run because a dependency failed or is unavailable.`);
    }

    pending.status = "running";
    events.push({ type: "plan_step_started", stepId: pending.id, action: pending.action });
    let result: ToolResult | undefined;
    let lastError = "";
    for (let attempt = 0; attempt <= options.maxStepRetries; attempt += 1) {
      result = await options.execute({ id: `plan_call_${pending.id}_${attempt + 1}`, name: pending.action, arguments: pending.arguments });
      if (!result.isError) break;
      lastError = String(result.output);
    }

    if (!result || result.isError) {
      pending.status = "failed";
      const error = lastError || "Plan step failed.";
      events.push({ type: "plan_step_failed", stepId: pending.id, action: pending.action, error });
      if (!options.replan || replans >= options.maxReplans) throw new Error(error);
      replans += 1;
      plan = clonePlan(await options.replan(plan, error, results));
      events.push({ type: "plan_revised", attempt: replans });
      continue;
    }

    pending.status = "completed";
    results.push({ step: { ...pending }, result });
    events.push({ type: "plan_step_completed", stepId: pending.id, action: pending.action });
  }
}

function clonePlan(plan: Plan): Plan {
  return { goal: plan.goal, steps: plan.steps.map((step) => ({ ...step, dependsOn: [...(step.dependsOn ?? [])] })) };
}
