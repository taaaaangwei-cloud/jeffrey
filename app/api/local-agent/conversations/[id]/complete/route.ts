import { z } from "zod";
import { createServerDependencies } from "../../../../../../lib/server/dependencies.ts";
import { authenticateLocalAgentRequest } from "../../../../../../lib/local-computer/agent-auth.ts";
import { apiErrorResponse } from "../../../../../../lib/http/api-error.ts";

const schema = z.object({ leaseToken: z.string().min(20).max(1000), eventId: z.string().min(1).max(200), reply: z.string().min(1).max(10_000) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const bodyText = await request.text();
  try {
    const dependencies = createServerDependencies(); const device = await authenticateLocalAgentRequest(request, bodyText, dependencies);
    if (!dependencies.localConversations) throw new Error("LOCAL_CONVERSATION_AGENT_DISABLED");
    const { id } = await context.params; const body = schema.parse(JSON.parse(bodyText));
    const completed = await dependencies.localConversations.complete({ deviceId: device.id, taskId: z.uuid().parse(id), ...body });
    await dependencies.push.deliver(completed.task.userId, completed.message).catch((error) => console.error("WEB_PUSH_DELIVERY_ERROR", { name: error instanceof Error ? error.name : "unknown" }));
    return Response.json({ success: true, status: completed.task.status, messageId: completed.message.id });
  } catch (error) { return apiErrorResponse(error, "LOCAL_CONVERSATION_COMPLETE"); }
}
