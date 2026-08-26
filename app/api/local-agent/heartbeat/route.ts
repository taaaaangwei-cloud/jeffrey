import { z } from "zod";
import { createServerDependencies } from "../../../../lib/server/dependencies.ts";
import { authenticateLocalAgentRequest } from "../../../../lib/local-computer/agent-auth.ts";
import { apiErrorResponse } from "../../../../lib/http/api-error.ts";

const schema = z.object({ agentVersion: z.string().regex(/^\d+\.\d+\.\d+$/u), codexVersion: z.string().max(80).nullable(), status: z.enum(["online", "paused", "incompatible"]) });

export async function POST(request: Request) {
  const body = await request.text();
  try {
    const dependencies = createServerDependencies(); const device = await authenticateLocalAgentRequest(request, body, dependencies);
    const updated = await dependencies.localComputerRepository.updateDeviceHeartbeat(device.id, schema.parse(JSON.parse(body)));
    return Response.json({ success: true, status: updated.status, serverTime: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiErrorResponse(error, "LOCAL_AGENT_HEARTBEAT"); }
}
