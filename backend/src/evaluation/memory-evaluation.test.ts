import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  EmbeddingProvider,
  EmbeddingRequest,
} from "../embeddings/types.js";
import type { MemoryRecord } from "../memory/types.js";
import { InMemoryVectorStore } from "../vector-store/in-memory-vector-store.js";
import { evaluateMemoryRetrieval } from "./memory-evaluation.js";

const memory = (id: string, userId: string, content: string): MemoryRecord => ({
  id,
  userId,
  content,
  type: "fact",
  importance: 0.8,
  createdAt: "2026-10-29T10:00:00.000Z",
  updatedAt: "2026-10-29T10:00:00.000Z",
});

function keywordProvider(): EmbeddingProvider {
  return {
    async embed(request: EmbeddingRequest) {
      const input = Array.isArray(request.input)
        ? request.input
        : [request.input];
      return {
        model: "test",
        dimensions: 3,
        vectors: input.map((value) =>
          value.toLowerCase().includes("typescript")
            ? [1, 0, 0]
            : value.toLowerCase().includes("react")
              ? [0, 1, 0]
              : [0, 0, 1],
        ),
      };
    },
  };
}

describe("memory retrieval evaluation", () => {
  it("reports hit rate, recall, precision, and user isolation", async () => {
    const report = await evaluateMemoryRetrieval({
      embeddingProvider: keywordProvider(),
      vectorStore: new InMemoryVectorStore(),
      retrieval: {
        enabled: true,
        topK: 2,
        minSimilarity: 0.8,
        minImportance: 0,
      },
      memories: [
        memory("ts-user-1", "user-1", "The user prefers TypeScript."),
        memory("react-user-1", "user-1", "The user is learning React."),
        memory("ts-user-2", "user-2", "The user prefers TypeScript."),
      ],
      cases: [
        {
          id: "typescript-user-1",
          userId: "user-1",
          query: "What language does the user prefer? TypeScript",
          expectedMemoryIds: ["ts-user-1"],
        },
        {
          id: "react-user-1",
          userId: "user-1",
          query: "What frontend library is the user learning? React",
          expectedMemoryIds: ["react-user-1"],
        },
      ],
    });

    assert.equal(report.hitRate, 1);
    assert.equal(report.recallAtK, 1);
    assert.equal(report.precisionAtK, 1);
    assert.equal(report.userIsolationPassed, true);
  });
});
