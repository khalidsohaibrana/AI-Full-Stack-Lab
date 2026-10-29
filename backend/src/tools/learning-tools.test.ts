import assert from "node:assert/strict";
import test from "node:test";
import { learningTools } from "./learning-tools.js";

test("calculator evaluates supported arithmetic safely", async () => {
  const calculator = learningTools.find((tool) => tool.name === "calculator");
  assert.ok(calculator);

  assert.deepEqual(
    await calculator.execute({ expression: "(15 * 8) + 2" }, { userId: "test" }),
    { expression: "(15 * 8) + 2", result: 122 },
  );
});

test("calculator rejects unsupported characters", async () => {
  const calculator = learningTools.find((tool) => tool.name === "calculator");
  assert.ok(calculator);

  await assert.rejects(
    () => calculator.execute({ expression: "process.exit()" }, { userId: "test" }),
    /unsupported characters/,
  );
});
