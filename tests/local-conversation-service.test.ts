import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryChatRepository } from "../lib/chat/memory-repository.ts";
import { createLocalConversationService } from "../lib/local-conversation/service.ts";
import type { LocalConversationRepository } from "../lib/local-conversation/repository.ts";
import type { LocalConversationTask } from "../lib/local-conversation/types.ts";
import type { LocalComputerRepository } from "../lib/local-computer/repository.ts";

const ids = { user: "11111111-1111-4111-8111-111111111111", character: "22222222-2222-4222-8222-222222222222", conversation: "33333333-3333-4333-8333-333333333333", device: "44444444-4444-4444-8444-444444444444" };

test("local conversation queues once, leases to the paired Mac, and saves one real reply", async () => {
  const chat = createMemoryChatRepository({ userId: ids.user, character: { id: ids.character, name: "Jeffrey", avatarUrl: null, systemPrompt: "", personality: "温柔", relationshipSetting: "伴侣" }, conversationId: ids.conversation });
  let task: LocalConversationTask | null = null;
  const repository: LocalConversationRepository = {
    async create(command) { task = { id: crypto.randomUUID(), ...command, kind: "reply", status: "queued", leaseIdHash: null, leaseExpiresAt: null, replyMessageId: null, errorCode: null, createdAt: new Date().toISOString(), finishedAt: null, updatedAt: new Date().toISOString() }; return task; },
    async claim(deviceId, leaseIdHash, leaseExpiresAt) { if (!task || task.deviceId !== deviceId) return null; task = { ...task, status: "leased", leaseIdHash, leaseExpiresAt }; return task; },
    async getByDevice(taskId, deviceId) { return task?.id === taskId && task.deviceId === deviceId ? task : null; },
    async complete(taskId, _deviceId, _lease, reply) { const message = await chat.saveMessage({ conversationId: ids.conversation, sender: "assistant", type: "text", content: reply, mediaUrl: null, duration: null }); task = { ...task!, id: taskId, status: "completed", replyMessageId: message.id }; return { task, message }; },
    async fail() { task = { ...task!, status: "failed" }; return task; },
  };
  const devices = { async getActiveDeviceByOwner() { return { id: ids.device, status: "online" }; } } as unknown as LocalComputerRepository;
  const service = createLocalConversationService({ repository, chat, devices, leaseSeconds: 60 });
  const queued = await service.enqueue({ userId: ids.user, characterId: ids.character, conversationId: ids.conversation, message: "今天好累", type: "text", mediaUrl: null });
  const claimed = await service.claim(ids.device);
  assert.equal(claimed?.task.id, queued.task.id);
  await service.complete({ deviceId: ids.device, taskId: queued.task.id, leaseToken: claimed!.leaseToken, reply: "我在，先歇一会儿。", eventId: "event-1" });
  assert.deepEqual((await chat.listMessages(ids.conversation)).map(({ sender, content }) => ({ sender, content })), [
    { sender: "user", content: "今天好累" }, { sender: "assistant", content: "我在，先歇一会儿。" },
  ]);
});
