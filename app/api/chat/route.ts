import { parseChatRequest } from "../../../lib/chat/request.ts";
import { apiErrorResponse } from "../../../lib/http/api-error.ts";
import { resolvePrivateUser } from "../../../lib/http/private-user.ts";
import { createServerDependencies } from "../../../lib/server/dependencies.ts";
import { toPublicLocalComputerTask } from "../../../lib/local-computer/types.ts";
import { routeExplicitLocalIntent } from "../../../lib/local-conversation/explicit-intent.ts";

export async function POST(request: Request) {
  try {
    const dependencies = createServerDependencies();
    const userId = resolvePrivateUser(request, dependencies.config.privateUserId);
    const body = parseChatRequest(await request.json());
    if (dependencies.config.aiRuntime === "local_codex") {
      const explicitIntent = body.type === "text" ? routeExplicitLocalIntent(body.message) : null;
      if (explicitIntent && dependencies.localComputerTasks) {
        const character = await dependencies.chatRepository.getCharacterForConversation({ userId, characterId: body.characterId, conversationId: body.conversationId });
        if (!character) throw new Error("CHAT_RESOURCE_NOT_FOUND");
        const userMessage = await dependencies.chatRepository.saveMessage({ conversationId: body.conversationId, sender: "user", type: body.type, content: body.message, mediaUrl: body.mediaUrl ?? null, duration: body.duration ?? null });
        const created = await dependencies.localComputerTasks.create({ userId, conversationId: body.conversationId, sourceMessageId: userMessage.id, requestText: body.message, requestSummary: explicitIntent.summary, requestedOutcome: explicitIntent.requestedOutcome, riskLevel: explicitIntent.riskLevel, capabilities: explicitIntent.capabilities });
        const content = created.task.status === "awaiting_task_approval" ? `我理解了“${explicitIntent.summary}”。确认后我才会交给本地 Codex。` : `我已把“${explicitIntent.summary}”安全地发送给配对的 Mac。`;
        const message = await dependencies.chatRepository.saveMessage({ conversationId: body.conversationId, sender: "assistant", type: "text", content, mediaUrl: null, duration: null });
        return Response.json({ success: true, message: { ...message, status: "sent" }, localComputerTask: toPublicLocalComputerTask(created.task), localApprovalToken: created.approvalToken });
      }
      if (!dependencies.localConversations) throw new Error("LOCAL_CONVERSATION_AGENT_DISABLED");
      const queued = await dependencies.localConversations.enqueue({
        userId, characterId: body.characterId, conversationId: body.conversationId, message: body.message,
        type: body.type, mediaUrl: body.mediaUrl ?? null, duration: body.duration ?? null,
      });
      return Response.json({ success: true, pending: true, userMessage: { ...queued.userMessage, status: "sent" }, taskId: queued.task.id }, { status: 202 });
    }
    if (!dependencies.incoming) throw new Error("CHAT_RUNTIME_DISABLED");
    const result = await dependencies.incoming.send({
      userId,
      characterId: body.characterId,
      conversationId: body.conversationId,
      message: body.message,
      type: body.type,
      mediaUrl: body.mediaUrl ?? null,
      duration: body.duration ?? null,
    });
    const developmentTask = result.developmentTask
      ? await dependencies.developmentTasks.get(result.developmentTask.id, userId)
      : null;
    return Response.json({
      success: true,
      message: { ...result.message, status: "sent" },
      developmentTask: developmentTask ? {
        id: developmentTask.id,
        requestSummary: developmentTask.requestSummary,
        riskLevel: developmentTask.riskLevel,
        status: developmentTask.status,
        branchName: developmentTask.branchName,
        previewSha: developmentTask.previewSha,
        previewUrl: developmentTask.previewUrl,
        runnerUrl: developmentTask.runnerUrl,
        checks: developmentTask.checks,
        changeSummary: developmentTask.changeSummary,
        errorCode: developmentTask.errorCode,
        createdAt: developmentTask.createdAt,
        updatedAt: developmentTask.updatedAt,
      } : undefined,
      localComputerTask: result.localComputerTask ? toPublicLocalComputerTask(result.localComputerTask) : undefined,
      localApprovalToken: result.localApprovalToken,
    });
  } catch (error) {
    return apiErrorResponse(error, "CHAT");
  }
}
