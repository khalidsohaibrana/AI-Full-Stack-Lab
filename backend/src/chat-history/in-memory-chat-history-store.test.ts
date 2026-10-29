import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryChatHistoryStore } from "./in-memory-chat-history-store.js";

test("stores and reloads an exact conversation in order", async () => {
  const store = new InMemoryChatHistoryStore();
  const conversation = await store.createConversation("user-1");

  await store.appendTurn(
    conversation.id,
    "user-1",
    "What is an agent?",
    "An agent is a model connected to tools and control flow.",
  );
  await store.appendTurn(
    conversation.id,
    "user-1",
    "What is memory?",
    "Memory gives the agent information beyond one request.",
  );

  const messages = await store.listMessages(conversation.id, "user-1");
  assert.deepEqual(
    messages.map(({ role, content, sequenceNumber }) => ({ role, content, sequenceNumber })),
    [
      { role: "user", content: "What is an agent?", sequenceNumber: 0 },
      { role: "assistant", content: "An agent is a model connected to tools and control flow.", sequenceNumber: 1 },
      { role: "user", content: "What is memory?", sequenceNumber: 2 },
      { role: "assistant", content: "Memory gives the agent information beyond one request.", sequenceNumber: 3 },
    ],
  );

  const conversations = await store.listConversations("user-1");
  assert.equal(conversations[0]?.title, "What is an agent?");
});

test("does not expose another user's conversations or messages", async () => {
  const store = new InMemoryChatHistoryStore();
  const conversation = await store.createConversation("user-1");
  await store.appendTurn(conversation.id, "user-1", "private", "answer");

  assert.equal(await store.getConversation(conversation.id, "user-2"), null);
  assert.deepEqual(await store.listMessages(conversation.id, "user-2"), []);
  assert.deepEqual(await store.listConversations("user-2"), []);
});
