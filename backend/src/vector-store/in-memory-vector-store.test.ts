import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MemoryRecord } from "../memory/types.js";
import {
  InMemoryVectorStore,
  VectorStoreError,
} from "./in-memory-vector-store.js";

function memory(
  id: string,
  userId: string,
  content: string,
  overrides: Partial<MemoryRecord> = {},
): MemoryRecord {
  return {
    id,
    userId,
    content,
    type: "fact",
    importance: 0.5,
    createdAt: "2026-10-28T10:00:00.000Z",
    updatedAt: "2026-10-28T10:00:00.000Z",
    ...overrides,
  };
}

describe("InMemoryVectorStore", () => {
  it("ranks records by cosine similarity and returns only the requested topK", async () => {
    const store = new InMemoryVectorStore();
    await store.upsert({
      memory: memory("typescript", "user-1", "The user prefers TypeScript."),
      vector: [1, 0],
    });
    await store.upsert({
      memory: memory("react", "user-1", "The user is learning React."),
      vector: [0.7, 0.7],
    });
    await store.upsert({
      memory: memory("node", "user-1", "The user is learning Node.js."),
      vector: [0, 1],
    });

    const results = await store.search({
      userId: "user-1",
      vector: [1, 0],
      topK: 2,
    });

    assert.deepEqual(
      results.map((result) => result.memory.id),
      ["typescript", "react"],
    );
    assert.equal(results[0]?.similarity, 1);
  });

  it("isolates users and supports metadata filters", async () => {
    const store = new InMemoryVectorStore();
    await store.upsert({
      memory: memory("preference", "user-1", "TypeScript", {
        type: "preference",
        importance: 0.9,
      }),
      vector: [1, 0],
    });
    await store.upsert({
      memory: memory("project", "user-1", "Agent project", {
        type: "project",
        importance: 0.4,
      }),
      vector: [1, 0],
    });
    await store.upsert({
      memory: memory("other-user", "user-2", "TypeScript", {
        type: "preference",
        importance: 1,
      }),
      vector: [1, 0],
    });

    const results = await store.search({
      userId: "user-1",
      vector: [1, 0],
      topK: 10,
      types: ["preference"],
      minImportance: 0.8,
    });

    assert.deepEqual(results.map((result) => result.memory.id), ["preference"]);
  });

  it("supports a minimum similarity threshold and upsert replacement", async () => {
    const store = new InMemoryVectorStore();
    await store.upsert({
      memory: memory("memory-1", "user-1", "Original"),
      vector: [1, 0],
    });
    await store.upsert({
      memory: memory("memory-1", "user-1", "Updated"),
      vector: [0, 1],
    });

    const results = await store.search({
      userId: "user-1",
      vector: [1, 0],
      topK: 10,
      minSimilarity: 0.5,
    });

    assert.equal(store.size(), 1);
    assert.equal(results.length, 0);
  });

  it("rejects invalid and mismatched vectors", async () => {
    const store = new InMemoryVectorStore();

    await assert.rejects(
      store.upsert({
        memory: memory("empty", "user-1", "Empty"),
        vector: [],
      }),
      (error: unknown) =>
        error instanceof VectorStoreError && error.code === "invalid_record",
    );

    await store.upsert({
      memory: memory("valid", "user-1", "Valid"),
      vector: [1, 0],
    });

    await assert.rejects(
      store.upsert({
        memory: memory("wrong-size", "user-1", "Wrong size"),
        vector: [1, 0, 0],
      }),
      (error: unknown) =>
        error instanceof VectorStoreError &&
        error.code === "dimension_mismatch",
    );
  });

  it("does not expose mutable internal records", async () => {
    const store = new InMemoryVectorStore();
    const source = memory("memory-1", "user-1", "Original");
    await store.upsert({ memory: source, vector: [1, 0] });
    source.content = "Changed outside the store";

    const [result] = await store.search({
      userId: "user-1",
      vector: [1, 0],
      topK: 1,
    });

    assert.equal(result?.memory.content, "Original");
  });
});
