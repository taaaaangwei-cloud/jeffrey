import { createServerDependencies } from "../../../../../lib/server/dependencies.ts";
import { authenticateLocalAgentRequest } from "../../../../../lib/local-computer/agent-auth.ts";
import { apiErrorResponse } from "../../../../../lib/http/api-error.ts";

export async function POST(request: Request) {
  const body = await request.text();
  try {
    const dependencies = createServerDependencies(); const device = await authenticateLocalAgentRequest(request, body, dependencies);
    if (!dependencies.localAgentChannel) throw new Error("LOCAL_COMPUTER_AGENT_DISABLED");
    const claimed = await dependencies.localAgentChannel.claim(device.id);
    return Response.json({ success: true, task: claimed ? { id: claimed.task.id, request: claimed.task.requestText, summary: claimed.task.requestSummary, outcome: claimed.task.requestedOutcome, riskLevel: claimed.task.riskLevel, capabilities: claimed.task.capabilities, leaseToken: claimed.leaseToken } : null }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiErrorResponse(error, "LOCAL_AGENT_TASK"); }
}
