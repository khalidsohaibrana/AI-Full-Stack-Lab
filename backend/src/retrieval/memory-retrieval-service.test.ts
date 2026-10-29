import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  EmbeddingProvider,
  EmbeddingRequest,
  EmbeddingResult,
} from "../embeddings/types.js";
import type { MemoryRecord, MemorySearchResult } from "../memory/types.js";
import { MemoryRetrievalService } from "./memory-retrieval-service.js";
import type { VectorSearchQuery, VectorStore } from "../vector-store/types.js";

const memory: MemoryRecord = {
  id: "memory-1",
  userId: "user-1",
  content: "The user prefers TypeScript.",
  type: "preference",
  importance: 0.9,
  createdAt: "2026-10-29T10:00:00.000Z",
  updatedAt: "2026-10-29T10:00:00.000Z",
};

function provider(vector: number[]): EmbeddingProvider {
  return {
    async embed(_request: EmbeddingRequest): Promise<EmbeddingResult> {
      return { vectors: [vector], model: "test-embedding", dimensions: vector.length };
    },
  };
}

function store(results: MemorySearchResult[]): VectorStore & { query?: VectorSearchQuery } {
  return {
    query: undefined,
    async upsert() {},
    async search(query) {
      this.query = query;
      return results;
    },
    async list() {
      return results.map((result) => result.memory);
    },
    size() {
      return results.length;
    },
  };
}

const config = {
  enabled: true,
  topK: 3,
  minSimilarity: 0.75,
  minImportance: 0,
};

describe("MemoryRetrievalService", () => {
  it("embeds a query, searches the store, and formats retrieved context", async () => {
    const vectorStore = store([{ memory, similarity: 0.92 }]);
    const service = new MemoryRetrievalService(
      provider([1, 0]),
      vectorStore,
      config,
    );

    const result = await service.retrieve("user-1", "What language do I prefer?");

    assert.equal(result.metadata.reason, "matches_found");
    assert.equal(result.metadata.resultCount, 1);
    assert.equal(result.metadata.results[0]?.memoryId, "memory-1");
    assert.match(result.context, /<long_term_memory>/);
    assert.match(result.context, /The user prefers TypeScript/);
    assert.equal(vectorStore.query?.userId, "user-1");
    assert.deepEqual(vectorStore.query?.vector, [1, 0]);
  });

  it("does not search when embeddings are not configured", async () => {
    let searched = false;
    const vectorStore = store([]);
    vectorStore.search = async () => {
      searched = true;
      return [];
    };
    const service = new MemoryRetrievalService(null, vectorStore, config);

    const result = await service.retrieve("user-1", "query");

    assert.equal(result.metadata.reason, "embedding_not_configured");
    assert.equal(result.metadata.resultCount, 0);
    assert.equal(searched, false);
  });

  it("can be disabled without changing the store", async () => {
    let embedded = false;
    const embeddingProvider: EmbeddingProvider = {
      async embed() {
        embedded = true;
        return { vectors: [[1]], model: "test", dimensions: 1 };
      },
    };
    const service = new MemoryRetrievalService(embeddingProvider, store([]), {
      ...config,
      enabled: false,
    });

    const result = await service.retrieve("user-1", "query");

    assert.equal(result.metadata.reason, "disabled");
    assert.equal(embedded, false);
  });
});
