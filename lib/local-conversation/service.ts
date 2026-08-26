import type { ChatRepository, SendChatCommand } from "../chat/types.ts";
import type { LocalComputerRepository } from "../local-computer/repository.ts";
import type { LocalConversationRepository } from "./repository.ts";

function base64Url(bytes: Uint8Array) {
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
async function hash(value: string) { return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }

async function requireLease(repository: LocalConversationRepository, deviceId: string, taskId: string, leaseToken: string) {
  const task = await repository.getByDevice(taskId, deviceId);
  if (!task?.leaseIdHash || task.leaseIdHash !== await hash(leaseToken) || !task.leaseExpiresAt || Date.parse(task.leaseExpiresAt) < Date.now()) throw new Error("INVALID_LOCAL_CONVERSATION_LEASE");
  return task;
}

export function createLocalConversationService(dependencies: { repository: LocalConversationRepository; chat: ChatRepository; devices: LocalComputerRepository; leaseSeconds: number }) {
  return {
    async enqueue(command: SendChatCommand) {
      const character = await dependencies.chat.getCharacterForConversation(command);
      if (!character) throw new Error("CHAT_RESOURCE_NOT_FOUND");
      const device = await dependencies.devices.getActiveDeviceByOwner(command.userId);
      if (!device || device.status !== "online") throw new Error("LOCAL_DEVICE_OFFLINE");
      const userMessage = await dependencies.chat.saveMessage({ conversationId: command.conversationId, sender: "user", type: command.type, content: command.message, mediaUrl: command.mediaUrl, duration: command.duration ?? null });
      const task = await dependencies.repository.create({ userId: command.userId, conversationId: command.conversationId, characterId: command.characterId, sourceMessageId: userMessage.id, deviceId: device.id, requestText: command.message });
      return { userMessage, task };
    },
    async claim(deviceId: string) {
      const leaseToken = base64Url(crypto.getRandomValues(new Uint8Array(32)));
      const task = await dependencies.repository.claim(deviceId, await hash(leaseToken), new Date(Date.now() + dependencies.leaseSeconds * 1000).toISOString());
      if (!task) return null;
      const character = await dependencies.chat.getCharacterForConversation({ userId: task.userId, characterId: task.characterId, conversationId: task.conversationId });
      if (!character) throw new Error("CHAT_RESOURCE_NOT_FOUND");
      return { task, character, recentMessages: await dependencies.chat.listRecentMessages(task.conversationId, 30), leaseToken };
    },
    async complete(command: { deviceId: string; taskId: string; leaseToken: string; reply: string; eventId: string }) {
      const task = await requireLease(dependencies.repository, command.deviceId, command.taskId, command.leaseToken);
      const reply = command.reply.trim().slice(0, 10_000);
      if (!reply) throw new Error("EMPTY_LOCAL_CONVERSATION_REPLY");
      return dependencies.repository.complete(task.id, command.deviceId, task.leaseIdHash!, reply, command.eventId);
    },
    async fail(command: { deviceId: string; taskId: string; leaseToken: string; errorCode: string }) {
      const task = await requireLease(dependencies.repository, command.deviceId, command.taskId, command.leaseToken);
      return dependencies.repository.fail(task.id, command.deviceId, task.leaseIdHash!, command.errorCode.slice(0, 100));
    },
  };
}
