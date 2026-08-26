import type { ChatMessage } from "../chat/types.ts";

export interface ProactiveMessageService {
  generate(params: { userId: string; characterId: string; conversationId: string }): Promise<ChatMessage | null>;
}
