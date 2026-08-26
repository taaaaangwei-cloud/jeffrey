import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateLocalComputerTask, LocalComputerRepository, TransitionLocalComputerTask } from "./repository.ts";
import type { LocalComputerRiskLevel, LocalComputerTask, LocalComputerTaskEvent, LocalComputerTaskStatus, LocalDevice } from "./types.ts";

type Row = Record<string, unknown>;

function mapDevice(row: Row): LocalDevice {
  return {
    id: String(row.id), userId: String(row.user_id), name: String(row.name), platform: "macos", publicKey: String(row.public_key),
    tokenHash: row.token_hash as string | null, tokenExpiresAt: row.token_expires_at as string | null, pairedAt: String(row.paired_at),
    lastSeenAt: row.last_seen_at as string | null, revokedAt: row.revoked_at as string | null, agentVersion: String(row.agent_version),
    codexVersion: row.codex_version as string | null, status: row.status as LocalDevice["status"],
  };
}

function mapTask(row: Row): LocalComputerTask {
  return {
    id: String(row.id), userId: String(row.user_id), conversationId: String(row.conversation_id), sourceMessageId: String(row.source_message_id), deviceId: row.device_id as string | null,
    requestText: String(row.request_text), requestSummary: String(row.request_summary), requestedOutcome: String(row.requested_outcome),
    riskLevel: row.risk_level as LocalComputerRiskLevel, capabilities: (row.capabilities ?? []) as LocalComputerTask["capabilities"], status: row.status as LocalComputerTaskStatus,
    leaseIdHash: row.lease_id_hash as string | null, leaseExpiresAt: row.lease_expires_at as string | null, lastEventSequence: Number(row.last_event_sequence ?? 0),
    publicProgress: row.public_progress as string | null, pendingActionId: row.pending_action_id as string | null, pendingActionSummary: row.pending_action_summary as string | null,
    pendingActionRiskLevel: row.pending_action_risk_level as LocalComputerRiskLevel | null, resultSummary: row.result_summary as string | null, errorCode: row.error_code as string | null,
    createdAt: String(row.created_at), approvedAt: row.approved_at as string | null, startedAt: row.started_at as string | null, finishedAt: row.finished_at as string | null, updatedAt: String(row.updated_at),
  };
}

function mapEvent(row: Row): LocalComputerTaskEvent {
  return { id: String(row.id), taskId: String(row.task_id), userId: String(row.user_id), sequence: Number(row.sequence), eventType: String(row.event_type), publicMessage: String(row.public_message), metadata: (row.metadata ?? {}) as Record<string, unknown>, externalEventId: row.external_event_id as string | null, createdAt: String(row.created_at) };
}

export function createSupabaseLocalComputerRepository(client: SupabaseClient): LocalComputerRepository {
  return {
    async pairDevice(command) {
      const { data, error } = await client.rpc("pair_local_device", { device_user_id: command.userId, device_name: command.name, device_public_key: command.publicKey, device_agent_version: command.agentVersion, device_token_hash: command.tokenHash, device_token_expires_at: command.tokenExpiresAt }).single();
      if (error) throw error; return mapDevice(data as Row);
    },
    async getDeviceByOwner(deviceId, userId) {
      const { data, error } = await client.from("local_devices").select("*").eq("id", deviceId).eq("user_id", userId).maybeSingle();
      if (error) throw error; return data ? mapDevice(data as Row) : null;
    },
    async getDeviceById(deviceId) {
      const { data, error } = await client.from("local_devices").select("*").eq("id", deviceId).maybeSingle();
      if (error) throw error; return data ? mapDevice(data as Row) : null;
    },
    async getActiveDeviceByOwner(userId) {
      const { data, error } = await client.from("local_devices").select("*").eq("user_id", userId).is("revoked_at", null).maybeSingle();
      if (error) throw error; return data ? mapDevice(data as Row) : null;
    },
    async revokeDevice(deviceId, userId) {
      const { data, error } = await client.rpc("revoke_local_device", { target_device_id: deviceId, target_user_id: userId }).single();
      if (error) throw error; return mapDevice(data as Row);
    },
    async updateDeviceHeartbeat(deviceId, details) {
      const { data, error } = await client.from("local_devices").update({ agent_version: details.agentVersion, codex_version: details.codexVersion, status: details.status, last_seen_at: new Date().toISOString() }).eq("id", deviceId).is("revoked_at", null).select("*").single();
      if (error) throw error; return mapDevice(data as Row);
    },
    async createTask(command: CreateLocalComputerTask) {
      const { data, error } = await client.rpc("create_local_computer_task", { task_user_id: command.userId, task_conversation_id: command.conversationId, task_source_message_id: command.sourceMessageId, task_device_id: command.deviceId, task_request_text: command.requestText, task_request_summary: command.requestSummary, task_requested_outcome: command.requestedOutcome, task_risk_level: command.riskLevel, task_capabilities: command.capabilities }).single();
      if (error?.code === "23505") throw new Error("ACTIVE_LOCAL_COMPUTER_TASK_EXISTS");
      if (error) throw error; return mapTask(data as Row);
    },
    async getTaskByOwner(taskId, userId) {
      const { data, error } = await client.from("local_computer_tasks").select("*").eq("id", taskId).eq("user_id", userId).maybeSingle();
      if (error) throw error; return data ? mapTask(data as Row) : null;
    },
    async getTaskByDevice(taskId, deviceId) {
      const { data, error } = await client.from("local_computer_tasks").select("*").eq("id", taskId).eq("device_id", deviceId).maybeSingle();
      if (error) throw error; return data ? mapTask(data as Row) : null;
    },
    async getActiveTaskByOwner(userId) {
      const { data, error } = await client.from("local_computer_tasks").select("*").eq("user_id", userId).not("status", "in", '("completed","canceled","expired","failed")').maybeSingle();
      if (error) throw error; return data ? mapTask(data as Row) : null;
    },
    async transitionTask(command: TransitionLocalComputerTask) {
      const { data, error } = await client.rpc("transition_local_computer_task", { target_task_id: command.taskId, target_user_id: command.userId, target_status: command.to, task_patch: command.patch ?? {}, event_type_value: command.event.eventType, public_message_value: command.event.publicMessage, event_metadata: command.event.metadata, external_event_id_value: command.event.externalEventId ?? null }).single();
      if (error) throw error; return mapTask(data as Row);
    },
    async claimNextTask(command) {
      const { data, error } = await client.rpc("claim_local_computer_task", { target_device_id: command.deviceId, new_lease_id_hash: command.leaseIdHash, new_lease_expires_at: command.leaseExpiresAt }).maybeSingle();
      if (error) throw error; return data ? mapTask(data as Row) : null;
    },
    async appendAgentEvent(command) {
      const { data, error } = await client.rpc("append_local_agent_event", { target_task_id: command.taskId, target_device_id: command.deviceId, expected_lease_id_hash: command.leaseIdHash, event_sequence: command.sequence, event_type_value: command.event.eventType, public_message_value: command.event.publicMessage, event_metadata: command.event.metadata, external_event_id_value: command.event.externalEventId ?? null }).single();
      if (error) throw error; return mapTask(data as Row);
    },
    async listEvents(taskId, userId) {
      const { data, error } = await client.from("local_computer_task_events").select("*").eq("task_id", taskId).eq("user_id", userId).order("created_at");
      if (error) throw error; return (data as Row[]).map(mapEvent);
    },
  };
}
