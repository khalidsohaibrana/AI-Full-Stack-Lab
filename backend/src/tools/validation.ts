import type { JsonSchema, ToolCall, ToolDefinition } from "./types.js";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isJsonSchema(value: unknown): value is JsonSchema {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function validateToolDefinition(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return ["tool definition must be an object"];
  }

  const definition = value as Partial<ToolDefinition>;
  const errors: string[] = [];

  if (!isNonEmptyString(definition.name)) {
    errors.push("name must be non-empty");
  } else if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(definition.name)) {
    errors.push("name must contain only letters, numbers, underscores, or hyphens");
  }

  if (!isNonEmptyString(definition.description)) {
    errors.push("description must be non-empty");
  }

  if (!isJsonSchema(definition.parameters)) {
    errors.push("parameters must be a JSON schema object");
  }

  return errors;
}

export function isToolDefinition(value: unknown): value is ToolDefinition {
  return validateToolDefinition(value).length === 0;
}

export function validateToolCall(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return ["tool call must be an object"];
  }

  const call = value as Partial<ToolCall>;
  const errors: string[] = [];

  if (!isNonEmptyString(call.id)) errors.push("id must be non-empty");
  if (!isNonEmptyString(call.name)) errors.push("name must be non-empty");
  if (!("arguments" in call)) errors.push("arguments must be provided");

  return errors;
}

export function isToolCall(value: unknown): value is ToolCall {
  return validateToolCall(value).length === 0;
}
