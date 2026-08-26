import { z } from "zod";
import { createServerDependencies } from "../../../../../lib/server/dependencies.ts";
import { apiErrorResponse } from "../../../../../lib/http/api-error.ts";

const schema = z.object({ code: z.string().regex(/^[A-Z0-9]{6}$/u), claimToken: z.string().min(20).max(1000) });

export async function POST(request: Request) {
  try {
    const dependencies = createServerDependencies();
    if (!dependencies.localDevicePairing) throw new Error("LOCAL_COMPUTER_AGENT_DISABLED");
    const result = await dependencies.localDevicePairing.finish(schema.parse(await request.json()));
    return Response.json({ success: true, deviceId: result.device.id, sessionToken: result.sessionToken, expiresAt: result.device.tokenExpiresAt }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiErrorResponse(error, "LOCAL_AGENT_PAIRING"); }
}
