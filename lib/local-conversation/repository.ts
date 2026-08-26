import type { ChatMessage } from "../chat/types.ts";
import type { LocalConversationTask } from "./types.ts";

export interface CreateLocalConversationTask {
  userId: string; conversationId: string; characterId: string; sourceMessageId: string; deviceId: string; requestText: string;
}

export interface LocalConversationRepository {
  create(command: CreateLocalConversationTask): Promise<LocalConversationTask>;
  claim(deviceId: string, leaseIdHash: string, leaseExpiresAt: string): Promise<LocalConversationTask | null>;
  getByDevice(taskId: string, deviceId: string): Promise<LocalConversationTask | null>;
  complete(taskId: string, deviceId: string, leaseIdHash: string, reply: string, eventId: string): Promise<{ task: LocalConversationTask; message: ChatMessage }>;
  fail(taskId: string, deviceId: string, leaseIdHash: string, errorCode: string): Promise<LocalConversationTask>;
}
