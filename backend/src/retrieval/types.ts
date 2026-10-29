import type { MemorySearchResult } from "../memory/types.js";

export type RetrievalConfig = {
  enabled: boolean;
  topK: number;
  minSimilarity: number;
  minImportance: number;
};

export type RetrievalMetadata = {
  enabled: boolean;
  reason:
    | "disabled"
    | "embedding_not_configured"
    | "no_matches"
    | "matches_found";
  userId: string;
  query: string;
  resultCount: number;
  results: Array<{
    memoryId: string;
    similarity: number;
  }>;
};

export type RetrievalResult = {
  memories: MemorySearchResult[];
  context: string;
  metadata: RetrievalMetadata;
};
