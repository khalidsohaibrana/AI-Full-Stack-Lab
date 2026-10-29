import assert from "node:assert/strict";
import test from "node:test";
import type { ChatMessage } from "../chat/types.js";
import {
  ContextWindowError,
  prepareContext,
} from "./context-manager.js";

const estimator = {
  strategy: "character-ratio" as const,
  charsPerToken: 1,
  messageOverheadTokens: 0,
};

const manager = {
  strategy: "recent-turns" as const,
  oversizedMessagePolicy: "reject" as const,
};

test("keeps the newest complete turns within the budget", () => {
  const messages: ChatMessage[] = [
    { role: "user", content: "1111" },
    { role: "assistant", content: "2222" },
    { role: "user", content: "3333" },
    { role: "assistant", content: "4444" },
    { role: "user", content: "5555" },
  ];

  const result = prepareContext("", messages, estimator, 12, manager);

  assert.deepEqual(result.messages, [
    { role: "user", content: "3333" },
    { role: "assistant", content: "4444" },
    { role: "user", content: "5555" },
  ]);
  assert.equal(result.truncation.wasTruncated, true);
  assert.equal(result.truncation.receivedMessages, 5);
  assert.equal(result.truncation.sentMessages, 3);
  assert.equal(result.truncation.droppedMessages, 2);
  assert.equal(result.estimate.withinBudget, true);
});

test("removes a contiguous oldest suffix of complete turns", () => {
  const messages: ChatMessage[] = [
    { role: "user", content: "a" },
    { role: "assistant", content: "b" },
    { role: "user", content: "long message" },
    { role: "assistant", content: "long response" },
    { role: "user", content: "c" },
  ];

  const result = prepareContext("", messages, estimator, 5, manager);

  assert.deepEqual(result.messages, [{ role: "user", content: "c" }]);
  assert.equal(result.truncation.droppedMessages, 4);
});

test("does not mutate the original message array", () => {
  const messages: ChatMessage[] = [
    { role: "user", content: "old" },
    { role: "assistant", content: "reply" },
    { role: "user", content: "new" },
  ];
  const original = structuredClone(messages);

  prepareContext("", messages, estimator, 3, manager);

  assert.deepEqual(messages, original);
});

test("rejects a newest individual message that cannot fit", () => {
  assert.throws(
    () =>
      prepareContext(
        "",
        [{ role: "user", content: "123456" }],
        estimator,
        5,
        manager,
      ),
    (error) =>
      error instanceof ContextWindowError &&
      error.code === "message_too_large" &&
      error.message.includes("exceeding the available input budget"),
  );
});

test("rejects a complete newest turn that cannot fit without splitting it", () => {
  assert.throws(
    () =>
      prepareContext(
        "",
        [
          { role: "user", content: "1234" },
          { role: "assistant", content: "5678" },
        ],
        estimator,
        6,
        manager,
      ),
    (error) =>
      error instanceof ContextWindowError && error.code === "turn_too_large",
  );
});

test("includes instruction tokens in the available message budget", () => {
  const result = prepareContext(
    "1234",
    [{ role: "user", content: "5678" }],
    estimator,
    8,
    manager,
  );

  assert.equal(result.estimate.instructionsTokens, 4);
  assert.equal(result.estimate.messageTokens, 4);
  assert.equal(result.estimate.withinBudget, true);
});
