import assert from "node:assert/strict";
import test from "node:test";
import { isMemoryRecord, validateMemoryRecord } from "./validation.js";
import type { MemoryRecord } from "./types.js";

const validMemory: MemoryRecord = {
  id: "memory_123",
  userId: "user_42",
  content: "The user prefers TypeScript.",
  type: "preference",
  importance: 0.8,
  sourceConversationId: "conversation_9",
  createdAt: "2026-10-28T10:00:00.000Z",
  updatedAt: "2026-10-28T10:00:00.000Z",
};

test("accepts a valid memory record", () => {
  assert.equal(isMemoryRecord(validMemory), true);
  assert.deepEqual(validateMemoryRecord(validMemory), []);
});

test("rejects invalid memory types and importance values", () => {
  const errors = validateMemoryRecord({
    ...validMemory,
    type: "conversation",
    importance: 1.5,
  });

  assert.deepEqual(errors, [
    "type must be one of: fact, preference, project",
    "importance must be a number between 0 and 1",
  ]);
});

test("rejects missing ownership and content", () => {
  const errors = validateMemoryRecord({
    ...validMemory,
    userId: "",
    content: " ",
  });

  assert.deepEqual(errors, [
    "userId must be non-empty",
    "content must be non-empty",
  ]);
});

test("rejects an invalid optional source conversation id", () => {
  const errors = validateMemoryRecord({
    ...validMemory,
    sourceConversationId: "",
  });

  assert.deepEqual(errors, [
    "sourceConversationId must be non-empty when provided",
  ]);
});
