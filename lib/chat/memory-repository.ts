import type { Character, ChatMessage, ChatRepository } from "./types.ts";

export function createMemoryChatRepository(seed: {
  userId: string;
  character: Character;
  conversationId: string;
}) {
  const messages: ChatMessage[] = [];
  const repository: ChatRepository & { listMessages(conversationId: string): Promise<ChatMessage[]> } = {
    async getCharacterForConversation(params) {
      if (params.userId !== seed.userId || params.characterId !== seed.character.id || params.conversationId !== seed.conversationId) return null;
      return seed.character;
    },
    async saveMessage(message) {
      const saved: ChatMessage = {
        ...message,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      messages.push(saved);
      return saved;
    },
    async listRecentMessages(conversationId, limit) {
      return messages.filter((message) => message.conversationId === conversationId).slice(-limit);
    },
    async listMessages(conversationId) {
      return messages.filter((message) => message.conversationId === conversationId);
    },
  };
  return repository;
}
