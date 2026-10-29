import type { MemoryRecord, MemorySearchResult } from "../memory/types.js";
import type {
  MemoryVectorRecord,
  VectorSearchQuery,
  VectorStore,
} from "./types.js";

export class VectorStoreError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "invalid_record"
      | "invalid_query"
      | "dimension_mismatch",
  ) {
    super(message);
    this.name = "VectorStoreError";
  }
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length) {
    throw new VectorStoreError(
      "Vectors must have the same number of dimensions.",
      "dimension_mismatch",
    );
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;

    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;

  return dotProduct / Math.sqrt(leftMagnitude * rightMagnitude);
}

export class InMemoryVectorStore implements VectorStore {
  private readonly records = new Map<string, MemoryVectorRecord>();
  private dimensions: number | undefined;

  async upsert(record: MemoryVectorRecord): Promise<void> {
    this.validateVector(record.vector, "record");
    this.validateDimensions(record.vector);

    this.records.set(record.memory.id, {
      memory: { ...record.memory },
      vector: [...record.vector],
    });
  }

  async search(query: VectorSearchQuery): Promise<MemorySearchResult[]> {
    this.validateQuery(query);
    if (this.dimensions !== undefined && query.vector.length !== this.dimensions) {
      throw new VectorStoreError(
        `Vector has ${query.vector.length} dimensions, but this store requires ${this.dimensions}.`,
        "dimension_mismatch",
      );
    }

    const allowedTypes = query.types ? new Set(query.types) : undefined;
    const minImportance = query.minImportance ?? 0;
    const minSimilarity = query.minSimilarity ?? -1;

    return [...this.records.values()]
      .filter((record) => record.memory.userId === query.userId)
      .filter(
        (record) =>
          !allowedTypes || allowedTypes.has(record.memory.type),
      )
      .filter((record) => record.memory.importance >= minImportance)
      .map((record) => ({
        memory: { ...record.memory },
        similarity: cosineSimilarity(query.vector, record.vector),
      }))
      .filter((result) => result.similarity >= minSimilarity)
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, query.topK);
  }

  async list(userId: string): Promise<MemoryRecord[]> {
    return [...this.records.values()]
      .filter((record) => record.memory.userId === userId)
      .map((record) => ({ ...record.memory }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  size(): number {
    return this.records.size;
  }

  private validateQuery(query: VectorSearchQuery): void {
    if (!query.userId.trim()) {
      throw new VectorStoreError(
        "Vector search requires a non-empty userId.",
        "invalid_query",
      );
    }

    if (!Number.isInteger(query.topK) || query.topK <= 0) {
      throw new VectorStoreError(
        "Vector search topK must be a positive integer.",
        "invalid_query",
      );
    }

    if (
      query.minImportance !== undefined &&
      (!Number.isFinite(query.minImportance) ||
        query.minImportance < 0 ||
        query.minImportance > 1)
    ) {
      throw new VectorStoreError(
        "Vector search minImportance must be between 0 and 1.",
        "invalid_query",
      );
    }

    if (
      query.minSimilarity !== undefined &&
      (!Number.isFinite(query.minSimilarity) ||
        query.minSimilarity < -1 ||
        query.minSimilarity > 1)
    ) {
      throw new VectorStoreError(
        "Vector search minSimilarity must be between -1 and 1.",
        "invalid_query",
      );
    }

    this.validateVector(query.vector, "query");
  }

  private validateVector(vector: number[], source: "record" | "query"): void {
    if (
      vector.length === 0 ||
      vector.some((value) => !Number.isFinite(value))
    ) {
      throw new VectorStoreError(
        `Vector ${source} must contain at least one finite number.`,
        source === "query" ? "invalid_query" : "invalid_record",
      );
    }
  }

  private validateDimensions(vector: number[]): void {
    if (this.dimensions === undefined) {
      this.dimensions = vector.length;
      return;
    }

    if (vector.length !== this.dimensions) {
      throw new VectorStoreError(
        `Vector has ${vector.length} dimensions, but this store requires ${this.dimensions}.`,
        "dimension_mismatch",
      );
    }
  }
}
