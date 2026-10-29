import "dotenv/config";
import { createEmbeddingProvider } from "../embeddings/openai-compatible-provider.js";
import { evaluateMemoryRetrieval } from "./memory-evaluation.js";
import { loadConfig } from "../config.js";
import { InMemoryVectorStore } from "../vector-store/in-memory-vector-store.js";
import type { MemoryRecord } from "../memory/types.js";

const config = loadConfig();
const embeddingProvider = createEmbeddingProvider({
  apiKey: config.embedding.apiKey ?? "",
  baseUrl: config.embedding.baseUrl,
  model: config.embedding.model ?? "",
  dimensions: config.embedding.dimensions,
});

if (!embeddingProvider) {
  throw new Error(
    "Embedding configuration is required. Set AI_EMBEDDING_API_KEY and AI_EMBEDDING_MODEL.",
  );
}

const memories: MemoryRecord[] = [
  memory("eval-typescript", "eval-user", "The user prefers TypeScript."),
  memory("eval-react", "eval-user", "The user is learning React."),
  memory("eval-cooking", "eval-user", "The user enjoys cooking pasta."),
  memory("eval-other-user", "other-user", "The user prefers TypeScript."),
];

const report = await evaluateMemoryRetrieval({
  embeddingProvider,
  vectorStore: new InMemoryVectorStore(),
  retrieval: {
    enabled: true,
    topK: 3,
    minSimilarity: config.retrieval.minSimilarity,
    minImportance: config.retrieval.minImportance,
  },
  memories,
  cases: [
    {
      id: "typescript-query",
      userId: "eval-user",
      query: "Which programming language does the user prefer?",
      expectedMemoryIds: ["eval-typescript"],
    },
    {
      id: "react-query",
      userId: "eval-user",
      query: "What frontend technology is the user learning?",
      expectedMemoryIds: ["eval-react"],
    },
    {
      id: "cooking-query",
      userId: "eval-user",
      query: "What food hobby does the user have?",
      expectedMemoryIds: ["eval-cooking"],
    },
    {
      id: "user-isolation-query",
      userId: "other-user",
      query: "What programming language does the user prefer?",
      expectedMemoryIds: ["eval-other-user"],
    },
  ],
});

console.log(JSON.stringify(report, null, 2));

function memory(id: string, userId: string, content: string): MemoryRecord {
  return {
    id,
    userId,
    content,
    type: "fact",
    importance: 0.8,
    createdAt: "2026-10-29T10:00:00.000Z",
    updatedAt: "2026-10-29T10:00:00.000Z",
  };
}
