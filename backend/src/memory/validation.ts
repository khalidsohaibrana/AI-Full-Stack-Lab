import {
  memoryTypes,
  type MemoryInput,
  type MemoryRecord,
  type MemoryType,
} from "./types.js";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isMemoryType(value: unknown): value is MemoryType {
  return (
    typeof value === "string" &&
    (memoryTypes as readonly string[]).includes(value)
  );
}

function isIsoDate(value: unknown): value is string {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

export function validateMemoryRecord(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return ["memory must be an object"];
  }

  const memory = value as Record<string, unknown>;
  const errors: string[] = [];

  if (!isNonEmptyString(memory.id)) errors.push("id must be non-empty");
  if (!isNonEmptyString(memory.userId)) {
    errors.push("userId must be non-empty");
  }
  if (!isNonEmptyString(memory.content)) {
    errors.push("content must be non-empty");
  }
  if (!isMemoryType(memory.type)) {
    errors.push(`type must be one of: ${memoryTypes.join(", ")}`);
  }
  if (
    typeof memory.importance !== "number" ||
    !Number.isFinite(memory.importance) ||
    memory.importance < 0 ||
    memory.importance > 1
  ) {
    errors.push("importance must be a number between 0 and 1");
  }
  if (
    memory.sourceConversationId !== undefined &&
    !isNonEmptyString(memory.sourceConversationId)
  ) {
    errors.push("sourceConversationId must be non-empty when provided");
  }
  if (!isIsoDate(memory.createdAt)) {
    errors.push("createdAt must be a valid date string");
  }
  if (!isIsoDate(memory.updatedAt)) {
    errors.push("updatedAt must be a valid date string");
  }

  return errors;
}

export function isMemoryRecord(value: unknown): value is MemoryRecord {
  return validateMemoryRecord(value).length === 0;
}

export function validateMemoryInput(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return ["memory input must be an object"];
  }

  const input = value as Record<string, unknown>;
  const errors: string[] = [];

  if (!isNonEmptyString(input.userId)) {
    errors.push("userId must be non-empty");
  }
  if (!isNonEmptyString(input.content)) {
    errors.push("content must be non-empty");
  }
  if (!isMemoryType(input.type)) {
    errors.push(`type must be one of: ${memoryTypes.join(", ")}`);
  }
  if (
    typeof input.importance !== "number" ||
    !Number.isFinite(input.importance) ||
    input.importance < 0 ||
    input.importance > 1
  ) {
    errors.push("importance must be a number between 0 and 1");
  }
  if (
    input.sourceConversationId !== undefined &&
    !isNonEmptyString(input.sourceConversationId)
  ) {
    errors.push("sourceConversationId must be non-empty when provided");
  }

  return errors;
}

export function isMemoryInput(value: unknown): value is MemoryInput {
  return validateMemoryInput(value).length === 0;
}
