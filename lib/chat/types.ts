export const messageSenders = ["user", "assistant"] as const;
export const messageTypes = ["text", "image", "sticker", "audio", "system"] as const;

export type MessageSender = (typeof messageSenders)[number];
export type MessageType = (typeof messageTypes)[number];

export interface Character {
  id: string;
  name: string;
  avatarUrl: string | null;
  systemPrompt: string;
  personality: string;
  relationshipSetting: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  sender: MessageSender;
  type: MessageType;
  content: string;
  mediaUrl: string | null;
  duration: number | null;
  createdAt: string;
}

export interface SendChatCommand {
  userId: string;
  characterId: string;
  conversationId: string;
  message: string;
  type: MessageType;
  mediaUrl: string | null;
  duration?: number | null;
}

export interface ChatRepository {
  getCharacterForConversation(params: {
    userId: string;
    characterId: string;
    conversationId: string;
  }): Promise<Character | null>;
  saveMessage(message: Omit<ChatMessage, "id" | "createdAt">): Promise<ChatMessage>;
  listRecentMessages(conversationId: string, limit: number): Promise<ChatMessage[]>;
}

export interface AIProvider {
  chat(params: {
    systemPrompt: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    context?: string;
  }): Promise<string>;
}

export interface RetrievedContext {
  content: string;
  type?: string;
  importance?: number;
  sourceMessageId?: string | null;
  sourceDocumentId?: string | null;
}

export interface MemoryProvider {
  retrieve(params: { userId: string; characterId: string; query: string; limit: number }): Promise<RetrievedContext[]>;
  extractAndSave(params: {
    userId: string;
    characterId: string;
    sourceMessage: ChatMessage;
  }): Promise<RetrievedContext[]>;
}

export interface KnowledgeProvider {
  retrieve(params: { userId: string; query: string; limit: number }): Promise<RetrievedContext[]>;
}
