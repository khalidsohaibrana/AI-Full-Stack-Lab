export const memoryTypes = ["fact", "preference", "project"] as const;

export type MemoryType = (typeof memoryTypes)[number];

export type MemoryRecord = {
  id: string;
  userId: string;
  content: string;
  type: MemoryType;
  importance: number;
  sourceConversationId?: string;
  createdAt: string;
  updatedAt: string;
};

export type MemoryInput = Omit<
  MemoryRecord,
  "id" | "createdAt" | "updatedAt"
>;

export type MemorySearchQuery = {
  userId: string;
  query: string;
  topK: number;
  types?: MemoryType[];
  minImportance?: number;
};

export type MemorySearchResult = {
  memory: MemoryRecord;
  similarity: number;
};
