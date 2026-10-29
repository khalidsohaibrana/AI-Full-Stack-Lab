export type ConversationRecord = {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredChatMessage = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  sequenceNumber: number;
  createdAt: string;
};

export interface ChatHistoryStore {
  createConversation(userId: string, title?: string): Promise<ConversationRecord>;
  listConversations(userId: string): Promise<ConversationRecord[]>;
  getConversation(
    conversationId: string,
    userId: string,
  ): Promise<ConversationRecord | null>;
  listMessages(
    conversationId: string,
    userId: string,
  ): Promise<StoredChatMessage[]>;
  appendTurn(
    conversationId: string,
    userId: string,
    userMessage: string,
    assistantMessage: string,
  ): Promise<void>;
}
