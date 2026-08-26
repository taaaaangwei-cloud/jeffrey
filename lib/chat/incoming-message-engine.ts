import type { ChatMessage, ChatRepository, SendChatCommand } from "./types.ts";
import type { createChatEngine } from "./engine.ts";
import type { RoutedDevelopmentIntent } from "../development/intent-model.ts";
import type { CreateDevelopmentTask } from "../development/repository.ts";
import type { DevelopmentTask, DevelopmentTaskStatus } from "../development/types.ts";
import type { IncomingIntent } from "./incoming-intent-model.ts";
import type { LocalComputerTask } from "../local-computer/types.ts";

export interface CreatedDevelopmentTaskView {
  id: string;
  status: DevelopmentTaskStatus;
  requestSummary: string;
}

export interface IncomingMessageResult {
  message: ChatMessage;
  developmentTask?: CreatedDevelopmentTaskView;
  localComputerTask?: LocalComputerTask;
  localApprovalToken?: string;
}

type ChatEngine = ReturnType<typeof createChatEngine>;

export function createIncomingMessageEngine(dependencies: {
  repository: ChatRepository;
  chat: Pick<ChatEngine, "replyToSaved">;
  intent: { route?(message: string): Promise<RoutedDevelopmentIntent>; classify?(message: string): Promise<IncomingIntent> };
  tasks: {
    create(command: CreateDevelopmentTask): Promise<DevelopmentTask>;
    getActive(userId: string): Promise<DevelopmentTask | null>;
    continue(taskId: string, userId: string, instructions: string): Promise<DevelopmentTask>;
  };
  localTasks?: {
    create(command: {
      userId: string;
      conversationId: string;
      sourceMessageId: string;
      requestText: string;
      requestSummary: string;
      requestedOutcome: string;
      riskLevel: "low" | "medium" | "high" | "blocked";
      capabilities: Array<"files" | "shell" | "browser" | "applications">;
    }): Promise<{ task: LocalComputerTask; approvalToken?: string }>;
  };
  localComputerEnabled?: boolean;
}) {
  async function saveAssistant(conversationId: string, content: string) {
    return dependencies.repository.saveMessage({
      conversationId,
      sender: "assistant",
      type: "text",
      content,
      mediaUrl: null,
      duration: null,
    });
  }

  return {
    async send(command: SendChatCommand): Promise<IncomingMessageResult> {
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
      let intent: RoutedDevelopmentIntent | IncomingIntent = { kind: "chat" };
      if (command.type === "text") {
        try {
          intent = dependencies.intent.classify
            ? await dependencies.intent.classify(command.message)
            : await dependencies.intent.route!(command.message);
        } catch {
          intent = { kind: "chat" };
        }
      }
      if (intent.kind === "chat") {
        return { message: await dependencies.chat.replyToSaved(command, userMessage, character) };
      }
      if (intent.kind === "ambiguous" || intent.kind === "sensitive_confirmation") {
        return { message: await saveAssistant(command.conversationId, intent.question) };
      }
      if (intent.kind === "local_computer") {
        if (dependencies.localComputerEnabled === false) {
          return { message: await saveAssistant(command.conversationId, "Mac 控制功能尚未启用，我没有向任何电脑发送任务。") };
        }
        if (!dependencies.localTasks) {
          return { message: await saveAssistant(command.conversationId, "这项操作需要先在设置中配对客户的 Mac。当前没有向任何电脑发送任务。") };
        }
        try {
          const created = await dependencies.localTasks.create({
            userId: command.userId,
            conversationId: command.conversationId,
            sourceMessageId: userMessage.id,
            requestText: command.message,
            requestSummary: intent.summary,
            requestedOutcome: intent.requestedOutcome,
            riskLevel: intent.riskLevel,
            capabilities: intent.capabilities,
          });
          const content = created.task.status === "awaiting_task_approval"
            ? `我理解了“${intent.summary}”。这项操作需要你确认后，我才会交给本地 Codex。`
            : `我已把“${intent.summary}”安全地发送给配对的 Mac，执行进度会显示在这里。`;
          return { message: await saveAssistant(command.conversationId, content), localComputerTask: created.task, localApprovalToken: created.approvalToken };
        } catch (error) {
          const code = error instanceof Error ? error.message : "";
          const content = code === "LOCAL_ACTION_BLOCKED"
            ? "为了保护你的隐私与设备安全，这类操作不会被发送到电脑。"
            : code === "LOCAL_DEVICE_OFFLINE"
              ? "客户的 Mac 还没有配对或当前不可用，所以我没有发送这项任务。"
              : "本地电脑任务暂时无法创建，我没有模拟执行结果。";
          return { message: await saveAssistant(command.conversationId, content) };
        }
      }
      const activeTask = await dependencies.tasks.getActive(command.userId);
      const task = activeTask?.status === "awaiting_approval"
        ? await dependencies.tasks.continue(activeTask.id, command.userId, command.message)
        : activeTask
          ? activeTask
          : await dependencies.tasks.create({
        userId: command.userId,
        conversationId: command.conversationId,
        sourceMessageId: userMessage.id,
        requestText: command.message,
        requestSummary: intent.summary,
        requestedChanges: intent.requestedChanges,
        riskLevel: intent.riskLevel,
      });
      const message = await saveAssistant(command.conversationId, activeTask && activeTask.status !== "awaiting_approval"
        ? "当前修改任务还在安全流程中。等预览准备好后，你可以继续告诉我调整要求。"
        : task.status === "failed"
        ? `我理解了“${intent.summary}”，但云端修改通道还没有配置完成。正式版本没有受到影响。`
        : `收到。我已把“${intent.summary}”放进隔离修改队列。完成测试后会先给你预览，只有你确认才会发布。`);
      return { message, developmentTask: { id: task.id, status: task.status, requestSummary: task.requestSummary } };
    },
  };
}
