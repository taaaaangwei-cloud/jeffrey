import type { Character, ChatMessage } from "../chat/types.ts";

export const localConversationStatuses = ["queued", "leased", "completed", "failed"] as const;
export type LocalConversationStatus = (typeof localConversationStatuses)[number];

export interface LocalConversationTask {
  id: string;
  userId: string;
  conversationId: string;
  characterId: string;
  sourceMessageId: string | null;
  kind: "reply" | "proactive";
  deviceId: string;
  requestText: string;
  status: LocalConversationStatus;
  leaseIdHash: string | null;
  leaseExpiresAt: string | null;
  replyMessageId: string | null;
  errorCode: string | null;
  createdAt: string;
  finishedAt: string | null;
  updatedAt: string;
}

export interface ClaimedConversation {
  task: LocalConversationTask;
  character: Character;
  recentMessages: ChatMessage[];
  leaseToken: string;
}
