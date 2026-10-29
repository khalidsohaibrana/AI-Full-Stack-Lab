import type OpenAI from "openai";
import type { ToolDefinition } from "../tools/types.js";
import { completeWithOpenAICompatibleProvider } from "../agent/openai-compatible-agent.js";
import type { Plan } from "./types.js";
import { validatePlan } from "./validation.js";

const plannerInstructions = `You are a task planner. Return one valid JSON object only.
Do not return prose, markdown, commentary, or code fences.
Create the shortest executable plan using only the supplied tools.
Required shape: {"goal":"...","steps":[{"id":"step-1","description":"...","action":"tool_name","arguments":{},"dependsOn":[]}]}
Every step must include all five fields: id, description, action, arguments, and dependsOn.
arguments must always be a JSON object, even when empty. dependsOn must always be a JSON array.
Every action must be one of the supplied tool names. Do not invent tools.
Do not add a step for answering or summarizing; the server does that after tool execution.
Use one step unless the request genuinely requires multiple tool calls.`;

export async function createPlan(options: {
  client: OpenAI;
  model: string;
  maxOutputTokens: number;
  userRequest: string;
  tools: ToolDefinition[];
  maxSteps: number;
  maxGenerationAttempts: number;
  replanningContext?: string;
}): Promise<Plan> {
  const toolSummary = options.tools
    .map((tool) => `- ${tool.name}: ${tool.description}\n  parameters: ${JSON.stringify(tool.parameters)}`)
    .join("\n");
  const context = options.replanningContext
    ? `\nPrevious execution context:\n${options.replanningContext}`
    : "";
  let lastError = new Error("Planner did not return a valid plan.");
  let previousError = "";
  for (let attempt = 1; attempt <= options.maxGenerationAttempts; attempt += 1) {
    try {
      const response = await completeWithOpenAICompatibleProvider(
        options.client,
        options.model,
        options.maxOutputTokens,
        {
          messages: [
            { role: "system", content: `${plannerInstructions}\nMaximum steps: ${options.maxSteps}\nGeneration attempt: ${attempt}. JSON is mandatory.${previousError ? `\nThe previous candidate was rejected: ${previousError}. Generate a corrected plan from scratch.` : ""}` },
            { role: "user", content: `Request: ${options.userRequest}\n\nTools:\n${toolSummary}${context}` },
          ],
          tools: [],
          responseFormat: "json_object",
        },
      );
      if (response.kind !== "final") throw new Error("Planner returned tool calls instead of a plan.");
      return validatePlan(parseJson(response.text), options.tools.map((tool) => tool.name), options.maxSteps);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Planner returned an invalid plan.");
      previousError = lastError.message;
    }
  }
  throw lastError;
}

function parseJson(text: string): unknown {
  const normalized = text.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Planner did not return a JSON object.");
  try {
    return JSON.parse(normalized.slice(start, end + 1)) as unknown;
  } catch {
    throw new Error("Planner returned invalid JSON.");
  }
}
