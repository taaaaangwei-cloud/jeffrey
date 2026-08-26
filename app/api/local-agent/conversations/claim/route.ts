import { createServerDependencies } from "../../../../../lib/server/dependencies.ts";
import { authenticateLocalAgentRequest } from "../../../../../lib/local-computer/agent-auth.ts";
import { apiErrorResponse } from "../../../../../lib/http/api-error.ts";

export async function POST(request: Request) {
  const body = await request.text();
  try {
    const dependencies = createServerDependencies();
    const device = await authenticateLocalAgentRequest(request, body, dependencies);
    if (!dependencies.localConversations) throw new Error("LOCAL_CONVERSATION_AGENT_DISABLED");
    const claimed = await dependencies.localConversations.claim(device.id);
    return Response.json({ success: true, task: claimed ? {
      id: claimed.task.id, request: claimed.task.requestText, leaseToken: claimed.leaseToken,
      character: claimed.character,
      recentMessages: claimed.recentMessages.map(({ sender, content }) => ({ role: sender, content })),
    } : null }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiErrorResponse(error, "LOCAL_CONVERSATION_CLAIM"); }
}
