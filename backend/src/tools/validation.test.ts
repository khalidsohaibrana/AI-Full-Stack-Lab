import assert from "node:assert/strict";
import test from "node:test";
import {
  isToolCall,
  isToolDefinition,
  validateToolCall,
  validateToolDefinition,
} from "./validation.js";

const weatherDefinition = {
  name: "get_weather",
  description: "Get the current weather for a city.",
  parameters: {
    type: "object",
    properties: { city: { type: "string" } },
    required: ["city"],
    additionalProperties: false,
  },
};

test("accepts a provider-neutral tool definition", () => {
  assert.deepEqual(validateToolDefinition(weatherDefinition), []);
  assert.equal(isToolDefinition(weatherDefinition), true);
});

test("rejects an invalid tool definition", () => {
  assert.deepEqual(validateToolDefinition({
    name: "get weather",
    description: "",
    parameters: [],
  }), [
    "name must contain only letters, numbers, underscores, or hyphens",
    "description must be non-empty",
    "parameters must be a JSON schema object",
  ]);
});

test("accepts tool calls with any JSON-compatible arguments", () => {
  const call = {
    id: "call_123",
    name: "get_weather",
    arguments: { city: "Lahore" },
  };

  assert.deepEqual(validateToolCall(call), []);
  assert.equal(isToolCall(call), true);
});

test("rejects tool calls without an arguments field", () => {
  assert.deepEqual(validateToolCall({ id: "call_123", name: "get_weather" }), [
    "arguments must be provided",
  ]);
});
