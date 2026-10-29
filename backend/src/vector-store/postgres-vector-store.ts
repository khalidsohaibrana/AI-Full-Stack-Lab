import type { Pool } from "pg";
import type { MemorySearchResult } from "../memory/types.js";
import type {
  MemoryVectorRecord,
  VectorSearchQuery,
  VectorStore,
} from "./types.js";

type Queryable = Pick<Pool, "query">;

type MemoryRow = {
  id: string;
  user_id: string;
  content: string;
  type: "fact" | "preference" | "project";
  importance: number;
  source_conversation_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  similarity?: number | string;
};

export class PostgresVectorStore implements VectorStore {
  constructor(private readonly database: Queryable) {}

  async upsert(record: MemoryVectorRecord): Promise<void> {
    await this.database.query(
      `
        INSERT INTO memories (
          id, user_id, content, type, importance,
          source_conversation_id, created_at, updated_at, embedding
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector)
        ON CONFLICT (id) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          content = EXCLUDED.content,
          type = EXCLUDED.type,
          importance = EXCLUDED.importance,
          source_conversation_id = EXCLUDED.source_conversation_id,
          updated_at = EXCLUDED.updated_at,
          embedding = EXCLUDED.embedding
      `,
      [
        record.memory.id,
        record.memory.userId,
        record.memory.content,
        record.memory.type,
        record.memory.importance,
        record.memory.sourceConversationId ?? null,
        record.memory.createdAt,
        record.memory.updatedAt,
        formatVector(record.vector),
      ],
    );
  }

  async search(query: VectorSearchQuery): Promise<MemorySearchResult[]> {
    const values: unknown[] = [
      formatVector(query.vector),
      query.userId,
      query.minImportance ?? 0,
      query.minSimilarity ?? -1,
    ];
    const filters: string[] = [
      "user_id = $2",
      "importance >= $3",
      "1 - (embedding <=> $1::vector) >= $4",
    ];

    if (query.types && query.types.length > 0) {
      values.push(query.types);
      filters.push(`type = ANY($${values.length}::text[])`);
    }

    values.push(query.topK);
    const result = await this.database.query<MemoryRow>(
      `
        SELECT
          id, user_id, content, type, importance,
          source_conversation_id, created_at, updated_at,
          1 - (embedding <=> $1::vector) AS similarity
        FROM memories
        WHERE ${filters.join(" AND ")}
        ORDER BY embedding <=> $1::vector
        LIMIT $${values.length}
      `,
      values,
    );

    return result.rows.map((row) => ({
      memory: toMemoryRecord(row),
      similarity: Number(row.similarity ?? 0),
    }));
  }

  async size(): Promise<number> {
    const result = await this.database.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM memories",
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}

function formatVector(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

function toMemoryRecord(row: MemoryRow) {
  return {
    id: row.id,
    userId: row.user_id,
    content: row.content,
    type: row.type,
    importance: Number(row.importance),
    ...(row.source_conversation_id
      ? { sourceConversationId: row.source_conversation_id }
      : {}),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
