import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  ChatHistoryStore,
  ConversationRecord,
  StoredChatMessage,
} from "./types.js";

type Queryable = Pick<Pool, "query">;

type ConversationRow = {
  id: string;
  user_id: string;
  title: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  sequence_number: number;
  created_at: Date | string;
};

export class PostgresChatHistoryStore implements ChatHistoryStore {
  constructor(private readonly database: Queryable) {}

  async createConversation(
    userId: string,
    title = "New chat",
  ): Promise<ConversationRecord> {
    const now = new Date().toISOString();
    const result = await this.database.query<ConversationRow>(
      `
        INSERT INTO conversations (id, user_id, title, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $4)
        RETURNING id, user_id, title, created_at, updated_at
      `,
      [`conversation_${randomUUID().replaceAll("-", "")}`, userId, title.trim() || "New chat", now],
    );
    return toConversation(result.rows[0]);
  }

  async listConversations(userId: string): Promise<ConversationRecord[]> {
    const result = await this.database.query<ConversationRow>(
      `
        SELECT id, user_id, title, created_at, updated_at
        FROM conversations
        WHERE user_id = $1
        ORDER BY updated_at DESC
      `,
      [userId],
    );
    return result.rows.map(toConversation);
  }

  async getConversation(
    conversationId: string,
    userId: string,
  ): Promise<ConversationRecord | null> {
    const result = await this.database.query<ConversationRow>(
      `
        SELECT id, user_id, title, created_at, updated_at
        FROM conversations
        WHERE id = $1 AND user_id = $2
      `,
      [conversationId, userId],
    );
    return result.rows[0] ? toConversation(result.rows[0]) : null;
  }

  async listMessages(
    conversationId: string,
    userId: string,
  ): Promise<StoredChatMessage[]> {
    if (!(await this.getConversation(conversationId, userId))) return [];
    const result = await this.database.query<MessageRow>(
      `
        SELECT m.id, m.conversation_id, m.role, m.content,
          m.sequence_number, m.created_at
        FROM chat_messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE m.conversation_id = $1 AND c.user_id = $2
        ORDER BY m.sequence_number ASC
      `,
      [conversationId, userId],
    );
    return result.rows.map(toMessage);
  }

  async appendTurn(
    conversationId: string,
    userId: string,
    userMessage: string,
    assistantMessage: string,
  ): Promise<void> {
    const conversation = await this.getConversation(conversationId, userId);
    if (!conversation) throw new Error("Conversation was not found.");

    const current = await this.database.query<{ next_sequence: number }>(
      `
        SELECT COALESCE(MAX(sequence_number) + 1, 0)::int AS next_sequence
        FROM chat_messages
        WHERE conversation_id = $1
      `,
      [conversationId],
    );
    const nextSequence = Number(current.rows[0]?.next_sequence ?? 0);
    const now = new Date().toISOString();
    await this.database.query(
      `
        INSERT INTO chat_messages
          (id, conversation_id, role, content, sequence_number, created_at)
        VALUES
          ($1, $2, 'user', $3, $4, $6),
          ($5, $2, 'assistant', $7, $8, $6)
      `,
      [
        `message_${randomUUID().replaceAll("-", "")}`,
        conversationId,
        userMessage,
        nextSequence,
        `message_${randomUUID().replaceAll("-", "")}`,
        now,
        assistantMessage,
        nextSequence + 1,
      ],
    );
    await this.database.query(
      `
        UPDATE conversations
        SET title = CASE WHEN title = 'New chat' THEN LEFT($2, 80) ELSE title END,
            updated_at = $3
        WHERE id = $1 AND user_id = $4
      `,
      [conversationId, userMessage.trim() || "New chat", now, userId],
    );
  }
}

function toConversation(row: ConversationRow): ConversationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function toMessage(row: MessageRow): StoredChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    sequenceNumber: row.sequence_number,
    createdAt: toIsoString(row.created_at),
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
