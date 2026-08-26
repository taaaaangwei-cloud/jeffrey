import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatMessage } from "../chat/types.ts";
import type { LocalConversationRepository } from "./repository.ts";
import type { LocalConversationStatus, LocalConversationTask } from "./types.ts";

type Row = Record<string, unknown>;

function mapTask(row: Row): LocalConversationTask {
  return {
    id: String(row.id), userId: String(row.user_id), conversationId: String(row.conversation_id), characterId: String(row.character_id),
    sourceMessageId: row.source_message_id as string | null, kind: (row.kind ?? "reply") as LocalConversationTask["kind"], deviceId: String(row.device_id), requestText: String(row.request_text), status: row.status as LocalConversationStatus,
    leaseIdHash: row.lease_id_hash as string | null, leaseExpiresAt: row.lease_expires_at as string | null, replyMessageId: row.reply_message_id as string | null,
    errorCode: row.error_code as string | null, createdAt: String(row.created_at), finishedAt: row.finished_at as string | null, updatedAt: String(row.updated_at),
  };
}

function mapMessage(row: Row): ChatMessage {
  return { id: String(row.id), conversationId: String(row.conversation_id), sender: "assistant", type: "text", content: String(row.content), mediaUrl: null, duration: null, createdAt: String(row.created_at) };
}

export function createSupabaseLocalConversationRepository(client: SupabaseClient): LocalConversationRepository {
  return {
    async create(command) {
      const { data, error } = await client.rpc("create_local_conversation_task", { task_user_id: command.userId, task_conversation_id: command.conversationId, task_character_id: command.characterId, task_source_message_id: command.sourceMessageId, task_device_id: command.deviceId, task_request_text: command.requestText }).single();
      if (error) throw error; return mapTask(data as Row);
    },
    async claim(deviceId, leaseIdHash, leaseExpiresAt) {
      const { data, error } = await client.rpc("claim_local_conversation_task", { target_device_id: deviceId, new_lease_id_hash: leaseIdHash, new_lease_expires_at: leaseExpiresAt }).maybeSingle();
      if (error) throw error; return data ? mapTask(data as Row) : null;
    },
    async getByDevice(taskId, deviceId) {
      const { data, error } = await client.from("local_conversation_tasks").select("*").eq("id", taskId).eq("device_id", deviceId).maybeSingle();
      if (error) throw error; return data ? mapTask(data as Row) : null;
    },
    async complete(taskId, deviceId, leaseIdHash, reply, eventId) {
      const { data, error } = await client.rpc("complete_local_conversation_task", { target_task_id: taskId, target_device_id: deviceId, expected_lease_id_hash: leaseIdHash, reply_content: reply, external_event_id: eventId }).single();
      if (error) throw error;
      const value = data as { task: Row; message: Row };
      return { task: mapTask(value.task), message: mapMessage(value.message) };
    },
    async fail(taskId, deviceId, leaseIdHash, errorCode) {
      const { data, error } = await client.rpc("fail_local_conversation_task", { target_task_id: taskId, target_device_id: deviceId, expected_lease_id_hash: leaseIdHash, failure_code: errorCode }).single();
      if (error) throw error; return mapTask(data as Row);
    },
  };
}
