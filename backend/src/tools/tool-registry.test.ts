import assert from "node:assert/strict";
import test from "node:test";
import { ToolRegistry, ToolRegistryError } from "./tool-registry.js";

const tool = {
  name: "test_tool",
  description: "A test tool.",
  parameters: { type: "object", additionalProperties: false },
  async execute() {
    return { ok: true };
  },
};

test("registers tools and exposes provider-neutral definitions", () => {
  const registry = new ToolRegistry();
  registry.register(tool);

  assert.equal(registry.has("test_tool"), true);
  assert.deepEqual(registry.listDefinitions(), [
    {
      name: "test_tool",
      description: "A test tool.",
      parameters: { type: "object", additionalProperties: false },
    },
  ]);
});

test("rejects duplicate tool names", () => {
  const registry = new ToolRegistry();
  registry.register(tool);

  assert.throws(() => registry.register(tool), ToolRegistryError);
});

test("returns structured execution errors", async () => {
  const registry = new ToolRegistry();
  registry.register({
    ...tool,
    name: "failing_tool",
    async execute() {
      throw new Error("expected failure");
    },
  });

  const result = await registry.execute("failing_tool", {}, { userId: "test" }, 100);

  assert.equal(result.isError, true);
  assert.deepEqual(result.output, { error: "expected failure" });
});

test("returns a timeout as a structured execution error", async () => {
  const registry = new ToolRegistry();
  registry.register({
    ...tool,
    name: "slow_tool",
    async execute() {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { ok: true };
    },
  });

  const result = await registry.execute("slow_tool", {}, { userId: "test" }, 1);

  assert.equal(result.isError, true);
  assert.match(String((result.output as { error: string }).error), /timed out/);
});
