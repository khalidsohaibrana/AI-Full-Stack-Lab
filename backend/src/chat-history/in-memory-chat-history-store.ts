import { randomUUID } from "node:crypto";
import type {
  ChatHistoryStore,
  ConversationRecord,
  StoredChatMessage,
} from "./types.js";

export class InMemoryChatHistoryStore implements ChatHistoryStore {
  private readonly conversations = new Map<string, ConversationRecord>();
  private readonly messages = new Map<string, StoredChatMessage[]>();

  async createConversation(
    userId: string,
    title = "New chat",
  ): Promise<ConversationRecord> {
    const now = new Date().toISOString();
    const conversation: ConversationRecord = {
      id: `conversation_${randomUUID().replaceAll("-", "")}`,
      userId,
      title: title.trim() || "New chat",
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(conversation.id, conversation);
    this.messages.set(conversation.id, []);
    return { ...conversation };
  }

  async listConversations(userId: string): Promise<ConversationRecord[]> {
    return [...this.conversations.values()]
      .filter((conversation) => conversation.userId === userId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((conversation) => ({ ...conversation }));
  }

  async getConversation(
    conversationId: string,
    userId: string,
  ): Promise<ConversationRecord | null> {
    const conversation = this.conversations.get(conversationId);
    return conversation?.userId === userId ? { ...conversation } : null;
  }

  async listMessages(
    conversationId: string,
    userId: string,
  ): Promise<StoredChatMessage[]> {
    if (!(await this.getConversation(conversationId, userId))) return [];
    return (this.messages.get(conversationId) ?? []).map((message) => ({
      ...message,
    }));
  }

  async appendTurn(
    conversationId: string,
    userId: string,
    userMessage: string,
    assistantMessage: string,
  ): Promise<void> {
    const conversation = await this.getConversation(conversationId, userId);
    if (!conversation) throw new Error("Conversation was not found.");

    const conversationMessages = this.messages.get(conversationId) ?? [];
    const now = new Date().toISOString();
    const nextSequence = conversationMessages.length;
    conversationMessages.push(
      {
        id: `message_${randomUUID().replaceAll("-", "")}`,
        conversationId,
        role: "user",
        content: userMessage,
        sequenceNumber: nextSequence,
        createdAt: now,
      },
      {
        id: `message_${randomUUID().replaceAll("-", "")}`,
        conversationId,
        role: "assistant",
        content: assistantMessage,
        sequenceNumber: nextSequence + 1,
        createdAt: now,
      },
    );
    this.messages.set(conversationId, conversationMessages);
    const updated = this.conversations.get(conversationId)!;
    this.conversations.set(conversationId, {
      ...updated,
      title:
        updated.title === "New chat"
          ? userMessage.slice(0, 80).trim() || "New chat"
          : updated.title,
      updatedAt: now,
    });
  }
}
