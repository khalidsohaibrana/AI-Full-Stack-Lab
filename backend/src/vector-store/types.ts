import type {
  MemoryRecord,
  MemorySearchResult,
  MemoryType,
} from "../memory/types.js";

export type MemoryVectorRecord = {
  memory: MemoryRecord;
  vector: number[];
};

export type VectorSearchQuery = {
  userId: string;
  vector: number[];
  topK: number;
  types?: MemoryType[];
  minImportance?: number;
  minSimilarity?: number;
};

export interface VectorStore {
  upsert(record: MemoryVectorRecord): Promise<void>;
  search(query: VectorSearchQuery): Promise<MemorySearchResult[]>;
  list(userId: string): Promise<MemoryRecord[]>;
  size(): number | Promise<number>;
}
