import type {
  AIProvider,
  Character,
  ChatMessage,
  ChatRepository,
  KnowledgeProvider,
  MemoryProvider,
  SendChatCommand,
} from "./types.ts";

const BASE_SYSTEM_PROMPT = `你正在作为用户的长期 AI 伴侣与用户进行聊天。
请根据角色资料、人设、关系设定、历史聊天和长期记忆进行自然交流。
保持角色一致，优先使用自然、简洁的聊天语言；除非用户要求详细说明，否则不要像客服或百科一样长篇回复。
可以自然表达符合角色设定的关心、亲密与幽默。不要机械复述长期记忆，但相关时可以自然表现出记得。
不要编造不存在的共同经历；不确定过去发生过什么时不要假装记得，也不要透露内部数据库或检索机制。`;

export function createChatEngine(dependencies: {
  repository: ChatRepository;
  ai: AIProvider;
  memories: MemoryProvider;
  knowledge: KnowledgeProvider;
}) {
  async function replyToSaved(command: SendChatCommand, userMessage: ChatMessage, character: Character): Promise<ChatMessage> {
      const recent = await dependencies.repository.listRecentMessages(command.conversationId, 30);
      const [memories, knowledge] = await Promise.all([
        dependencies.memories.retrieve({ userId: command.userId, characterId: command.characterId, query: command.message, limit: 8 }).catch((error) => {
          console.error("MEMORY_RETRIEVAL_ERROR", { conversationId: command.conversationId, name: error instanceof Error ? error.name : "unknown" });
          return [];
        }),
        dependencies.knowledge.retrieve({ userId: command.userId, query: command.message, limit: 8 }).catch((error) => {
          console.error("KNOWLEDGE_RETRIEVAL_ERROR", { conversationId: command.conversationId, name: error instanceof Error ? error.name : "unknown" });
          return [];
        }),
      ]);
      const context = [
        memories.length ? `LONG TERM MEMORY\n${memories.map((item) => `- ${item.content}`).join("\n")}` : "",
        knowledge.length ? `KNOWLEDGE CONTEXT\n${knowledge.map((item) => `- ${item.content}`).join("\n")}` : "",
      ].filter(Boolean).join("\n\n");
      const systemPrompt = [
        BASE_SYSTEM_PROMPT,
        `角色：${character.name}`,
        `性格：${character.personality}`,
        `关系：${character.relationshipSetting}`,
        character.systemPrompt,
      ].filter(Boolean).join("\n");
      const reply = await dependencies.ai.chat({
        systemPrompt,
        context,
        messages: recent.map((message) => ({ role: message.sender, content: message.content })),
      });
      const assistantMessage = await dependencies.repository.saveMessage({
        conversationId: command.conversationId,
        sender: "assistant",
        type: "text",
        content: reply,
        mediaUrl: null,
        duration: null,
      });
      await dependencies.memories.extractAndSave({
        userId: command.userId,
        characterId: command.characterId,
        sourceMessage: userMessage,
      }).catch((error) => {
        console.error("MEMORY_EXTRACTION_ERROR", { messageId: userMessage.id, name: error instanceof Error ? error.name : "unknown" });
        return [];
      });
      return assistantMessage;
  }

  return {
    async send(command: SendChatCommand): Promise<ChatMessage> {
      const character = await dependencies.repository.getCharacterForConversation(command);
      if (!character) throw new Error("CHAT_RESOURCE_NOT_FOUND");

      const userMessage = await dependencies.repository.saveMessage({
        conversationId: command.conversationId,
        sender: "user",
        type: command.type,
        content: command.message,
        mediaUrl: command.mediaUrl,
        duration: command.duration ?? null,
      });
      return replyToSaved(command, userMessage, character);
    },
    replyToSaved,
  };
}
