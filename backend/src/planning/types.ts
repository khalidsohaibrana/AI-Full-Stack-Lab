import type { ToolResult } from "../tools/types.js";

export type PlanStepStatus = "pending" | "running" | "completed" | "failed";

export type PlanStep = {
  id: string;
  description: string;
  action: string;
  arguments: unknown;
  dependsOn?: string[];
  status: PlanStepStatus;
};

export type Plan = {
  goal: string;
  steps: PlanStep[];
};

export type PlanningEvent =
  | { type: "plan_created"; goal: string; stepCount: number }
  | { type: "plan_step_started"; stepId: string; action: string }
  | { type: "plan_step_completed"; stepId: string; action: string }
  | { type: "plan_step_failed"; stepId: string; action: string; error: string }
  | { type: "plan_revised"; attempt: number };

export type PlanExecutionResult = {
  plan: Plan;
  results: Array<{ step: PlanStep; result: ToolResult }>;
  events: PlanningEvent[];
  replans: number;
};
