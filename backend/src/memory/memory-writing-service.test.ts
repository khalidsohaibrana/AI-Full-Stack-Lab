import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  EmbeddingProvider,
  EmbeddingRequest,
  EmbeddingResult,
} from "../embeddings/types.js";
import type { MemoryVectorRecord } from "../vector-store/types.js";
import {
  MemoryWritingError,
  MemoryWritingService,
} from "./memory-writing-service.js";

function provider(vector: number[]): EmbeddingProvider {
  return {
    async embed(_request: EmbeddingRequest): Promise<EmbeddingResult> {
      return { vectors: [vector], model: "test-embedding", dimensions: vector.length };
    },
  };
}

function store() {
  const records: MemoryVectorRecord[] = [];
  return {
    records,
    async upsert(record: MemoryVectorRecord) {
      const index = records.findIndex((item) => item.memory.id === record.memory.id);
      if (index >= 0) records[index] = record;
      else records.push(record);
    },
    async search() {
      return [];
    },
    async list() {
      return records.map((record) => record.memory);
    },
    size: () => records.length,
  };
}

describe("MemoryWritingService", () => {
  it("validates, embeds, and stores a memory", async () => {
    const vectorStore = store();
    const service = new MemoryWritingService(
      provider([0.5, 0.5]),
      vectorStore,
      () => "2026-10-29T10:00:00.000Z",
    );

    const memory = await service.write({
      userId: "user-1",
      content: "The user prefers TypeScript.",
      type: "preference",
      importance: 0.9,
    });

    assert.match(memory.id, /^memory_[a-f0-9]{24}$/);
    assert.equal(vectorStore.records.length, 1);
    assert.deepEqual(vectorStore.records[0]?.vector, [0.5, 0.5]);
    assert.equal(vectorStore.records[0]?.memory.id, memory.id);
  });

  it("uses a deterministic id so the same memory is updated instead of duplicated", async () => {
    const vectorStore = store();
    const service = new MemoryWritingService(
      provider([1, 0]),
      vectorStore,
      () => "2026-10-29T10:00:00.000Z",
    );
    const input = {
      userId: "user-1",
      content: "The user prefers TypeScript.",
      type: "preference" as const,
      importance: 0.9,
    };

    const first = await service.write(input);
    const second = await service.write({ ...input, importance: 0.7 });

    assert.equal(first.id, second.id);
    assert.equal(vectorStore.size(), 1);
    assert.equal(vectorStore.records[0]?.memory.importance, 0.7);
  });

  it("rejects invalid input before requiring embeddings", async () => {
    const service = new MemoryWritingService(null, store());

    await assert.rejects(
      service.write({ userId: "user-1", content: "", type: "fact" }),
      (error: unknown) =>
        error instanceof MemoryWritingError &&
        error.code === "invalid_input" &&
        error.details.includes("content must be non-empty"),
    );
  });

  it("reports missing embedding configuration clearly", async () => {
    const service = new MemoryWritingService(null, store());

    await assert.rejects(
      service.write({
        userId: "user-1",
        content: "The user prefers TypeScript.",
        type: "preference",
        importance: 0.9,
      }),
      (error: unknown) =>
        error instanceof MemoryWritingError &&
        error.code === "embedding_not_configured",
    );
  });
});
