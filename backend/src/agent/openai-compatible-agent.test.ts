import assert from "node:assert/strict";
import test from "node:test";
import { parseContentToolCall } from "./openai-compatible-agent.js";

test("normalizes a JSON tool request emitted as assistant content", () => {
  const call = parseContentToolCall(
    '{"name":"get_directions","parameters":{"origin":"Lahore","destination":"Islamabad"}}',
    ["get_directions"],
  );

  assert.ok(call);
  assert.equal(call.name, "get_directions");
  assert.deepEqual(call.arguments, {
    origin: "Lahore",
    destination: "Islamabad",
  });
});

test("does not treat ordinary JSON text as a tool call", () => {
  assert.equal(
    parseContentToolCall('{"name":"unknown","value":true}', ["calculator"]),
    null,
  );
});

test("finds a tool request embedded in explanatory model text", () => {
  const call = parseContentToolCall(
    'I will use directions now: {"name":"get_directions","parameters":{"origin":"Lahore","destination":"Islamabad"}}',
    ["get_directions"],
  );

  assert.ok(call);
  assert.equal(call.name, "get_directions");
});
