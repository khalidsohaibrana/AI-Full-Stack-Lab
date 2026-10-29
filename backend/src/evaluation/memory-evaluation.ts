import type { EmbeddingProvider } from "../embeddings/types.js";
import type {
  MemoryRecord,
  MemorySearchResult,
} from "../memory/types.js";
import { MemoryRetrievalService } from "../retrieval/memory-retrieval-service.js";
import type { RetrievalConfig } from "../retrieval/types.js";
import type { VectorStore } from "../vector-store/types.js";

export type MemoryEvaluationCase = {
  id: string;
  userId: string;
  query: string;
  expectedMemoryIds: string[];
};

export type MemoryEvaluationCaseResult = {
  id: string;
  userId: string;
  query: string;
  expectedMemoryIds: string[];
  retrievedMemoryIds: string[];
  hit: boolean;
  recall: number;
  precision: number;
};

export type MemoryEvaluationReport = {
  queryCount: number;
  hitRate: number;
  recallAtK: number;
  precisionAtK: number;
  userIsolationPassed: boolean;
  cases: MemoryEvaluationCaseResult[];
};

export async function evaluateMemoryRetrieval(options: {
  embeddingProvider: EmbeddingProvider;
  vectorStore: VectorStore;
  retrieval: RetrievalConfig;
  memories: MemoryRecord[];
  cases: MemoryEvaluationCase[];
}): Promise<MemoryEvaluationReport> {
  for (const memory of options.memories) {
    const embedding = await options.embeddingProvider.embed({
      input: memory.content,
    });
    const vector = embedding.vectors[0];

    if (!vector) {
      throw new Error(`No embedding returned for memory ${memory.id}.`);
    }

    await options.vectorStore.upsert({ memory, vector });
  }

  const service = new MemoryRetrievalService(
    options.embeddingProvider,
    options.vectorStore,
    options.retrieval,
  );
  const results: MemoryEvaluationCaseResult[] = [];
  const memoryOwners = new Map(
    options.memories.map((memory) => [memory.id, memory.userId]),
  );

  for (const evaluationCase of options.cases) {
    const retrieval = await service.retrieve(
      evaluationCase.userId,
      evaluationCase.query,
    );
    results.push(
      evaluateCase(
        evaluationCase,
        retrieval.memories,
      ),
    );
  }

  const expectedCount = results.reduce(
    (total, result) => total + result.expectedMemoryIds.length,
    0,
  );
  const retrievedRelevantCount = results.reduce(
    (total, result) =>
      total +
      result.retrievedMemoryIds.filter((id) =>
        result.expectedMemoryIds.includes(id),
      ).length,
    0,
  );
  const retrievedCount = results.reduce(
    (total, result) => total + result.retrievedMemoryIds.length,
    0,
  );

  return {
    queryCount: results.length,
    hitRate: ratio(results.filter((result) => result.hit).length, results.length),
    recallAtK: ratio(retrievedRelevantCount, expectedCount),
    precisionAtK: ratio(retrievedRelevantCount, retrievedCount),
    userIsolationPassed: results.every((result) =>
      result.retrievedMemoryIds.every(
        (id) => memoryOwners.get(id) === result.userId,
      ),
    ),
    cases: results,
  };
}

function evaluateCase(
  evaluationCase: MemoryEvaluationCase,
  memories: MemorySearchResult[],
): MemoryEvaluationCaseResult {
  const expected = new Set(evaluationCase.expectedMemoryIds);
  const retrievedMemoryIds = memories.map((result) => result.memory.id);
  const relevantCount = retrievedMemoryIds.filter((id) => expected.has(id)).length;

  return {
    id: evaluationCase.id,
    userId: evaluationCase.userId,
    query: evaluationCase.query,
    expectedMemoryIds: evaluationCase.expectedMemoryIds,
    retrievedMemoryIds,
    hit: relevantCount > 0,
    recall: ratio(relevantCount, expected.size),
    precision: ratio(relevantCount, retrievedMemoryIds.length),
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}
