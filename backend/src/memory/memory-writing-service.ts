import { createHash } from "node:crypto";
import type { EmbeddingProvider } from "../embeddings/types.js";
import type { MemoryInput, MemoryRecord } from "./types.js";
import { validateMemoryInput, validateMemoryRecord } from "./validation.js";
import type { VectorStore } from "../vector-store/types.js";

export class MemoryWritingError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "invalid_input"
      | "embedding_not_configured"
      | "embedding_failed",
    public readonly details: string[] = [],
  ) {
    super(message);
    this.name = "MemoryWritingError";
  }
}

export class MemoryWritingService {
  constructor(
    private readonly embeddingProvider: EmbeddingProvider | null,
    private readonly vectorStore: VectorStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async write(input: unknown): Promise<MemoryRecord> {
    const inputErrors = validateMemoryInput(input);
    if (inputErrors.length > 0) {
      throw new MemoryWritingError(
        "Memory input is invalid.",
        "invalid_input",
        inputErrors,
      );
    }

    if (!this.embeddingProvider) {
      throw new MemoryWritingError(
        "Embedding provider is not configured.",
        "embedding_not_configured",
      );
    }

    const memoryInput = input as MemoryInput;
    const timestamp = this.now();
    const memory: MemoryRecord = {
      ...memoryInput,
      id: createMemoryId(memoryInput),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const recordErrors = validateMemoryRecord(memory);

    if (recordErrors.length > 0) {
      throw new MemoryWritingError(
        "Generated memory record is invalid.",
        "invalid_input",
        recordErrors,
      );
    }

    let embedding;
    try {
      embedding = await this.embeddingProvider.embed({
        input: memory.content,
      });
    } catch (error) {
      throw new MemoryWritingError(
        error instanceof Error ? error.message : "Embedding request failed.",
        "embedding_failed",
      );
    }

    const vector = embedding.vectors[0];
    if (!vector) {
      throw new MemoryWritingError(
        "Embedding provider returned no vector for the memory.",
        "embedding_failed",
      );
    }

    await this.vectorStore.upsert({ memory, vector });
    return memory;
  }
}

function createMemoryId(input: MemoryInput): string {
  const source = [input.userId, input.type, input.content.trim()].join("\0");
  const digest = createHash("sha256").update(source).digest("hex");
  return `memory_${digest.slice(0, 24)}`;
}
