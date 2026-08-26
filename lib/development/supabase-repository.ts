import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppendDevelopmentEvent,
  CreateDevelopmentTask,
  DevelopmentTaskRepository,
  TransitionDevelopmentTask,
} from "./repository.ts";
import type { DevelopmentTask, DevelopmentTaskEvent, DevelopmentTaskStatus } from "./types.ts";

type TaskRow = Record<string, unknown>;

function mapTask(row: TaskRow): DevelopmentTask {
  return {
    id: String(row.id), userId: String(row.user_id), conversationId: String(row.conversation_id), sourceMessageId: String(row.source_message_id),
    requestText: String(row.request_text), requestSummary: String(row.request_summary), requestedChanges: Array.isArray(row.requested_changes) ? row.requested_changes.map(String) : [],
    riskLevel: row.risk_level === "sensitive" ? "sensitive" : "normal", status: row.status as DevelopmentTaskStatus,
    repositoryFullName: row.repository_full_name as string | null, branchName: row.branch_name as string | null, baseSha: row.base_sha as string | null,
    previewSha: row.preview_sha as string | null, runnerRunId: row.runner_run_id as string | null, runnerUrl: row.runner_url as string | null,
    previewUrl: row.preview_url as string | null,
    checks: (row.test_summary ?? { lint: "pending", typecheck: "pending", tests: "pending", build: "pending" }) as DevelopmentTask["checks"],
    changeSummary: row.change_summary as string | null, approvalNonceHash: row.approval_nonce_hash as string | null,
    approvalExpiresAt: row.approval_expires_at as string | null, approvedAt: row.approved_at as string | null,
    publishedSha: row.published_sha as string | null, previousProductionSha: row.previous_production_sha as string | null,
    publishedAt: row.published_at as string | null, errorCode: row.error_code as string | null,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function mapEvent(row: TaskRow): DevelopmentTaskEvent {
  return {
    id: String(row.id), taskId: String(row.task_id), userId: String(row.user_id), eventType: String(row.event_type),
    publicMessage: String(row.public_message), metadata: (row.metadata ?? {}) as Record<string, unknown>,
    externalEventId: row.external_event_id as string | null, createdAt: String(row.created_at),
  };
}

export function createSupabaseDevelopmentTaskRepository(client: SupabaseClient): DevelopmentTaskRepository {
  async function appendEvent(taskId: string, userId: string, event: AppendDevelopmentEvent) {
    const { data, error } = await client.from("development_task_events").insert({
      task_id: taskId, user_id: userId, event_type: event.eventType, public_message: event.publicMessage,
      metadata: event.metadata, external_event_id: event.externalEventId ?? null,
    }).select("*").single();
    if (error?.code === "23505" && event.externalEventId) return null;
    if (error) throw error;
    return mapEvent(data as TaskRow);
  }

  return {
    async create(command: CreateDevelopmentTask) {
      const { data, error } = await client.rpc("create_development_task", {
        task_user_id: command.userId, task_conversation_id: command.conversationId, task_source_message_id: command.sourceMessageId,
        task_request_text: command.requestText, task_request_summary: command.requestSummary, task_requested_changes: command.requestedChanges,
        task_risk_level: command.riskLevel, task_repository_full_name: command.repositoryFullName ?? null,
      }).single();
      if (error?.code === "23505") throw new Error("ACTIVE_DEVELOPMENT_TASK_EXISTS");
      if (error) throw error;
      return mapTask(data as TaskRow);
    },
    async getByOwner(taskId, userId) {
      const { data, error } = await client.from("development_tasks").select("*").eq("id", taskId).eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data ? mapTask(data as TaskRow) : null;
    },
    async getActiveByOwner(userId) {
      const { data, error } = await client.from("development_tasks").select("*").eq("user_id", userId)
        .not("status", "in", '("failed","canceled","published","rolled_back")').maybeSingle();
      if (error) throw error;
      return data ? mapTask(data as TaskRow) : null;
    },
    async getLatestByOwner(userId) {
      const { data, error } = await client.from("development_tasks").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data ? mapTask(data as TaskRow) : null;
    },
    async transition(command: TransitionDevelopmentTask) {
      const { data, error } = await client.rpc("transition_development_task", {
        target_task_id: command.taskId, target_user_id: command.userId, target_status: command.to,
        task_patch: command.patch ?? {}, event_type_value: command.event.eventType,
        public_message_value: command.event.publicMessage, event_metadata: command.event.metadata,
        external_event_id_value: command.event.externalEventId ?? null,
      }).single();
      if (error) throw error;
      return mapTask(data as TaskRow);
    },
    appendEvent,
    async listEvents(taskId, userId) {
      const { data, error } = await client.from("development_task_events").select("*").eq("task_id", taskId).eq("user_id", userId).order("created_at");
      if (error) throw error;
      return (data as TaskRow[]).map(mapEvent);
    },
  };
}
