import { z } from "zod";
import { createServerDependencies } from "../../../../../lib/server/dependencies.ts";
import { resolvePrivateUser } from "../../../../../lib/http/private-user.ts";
import { apiErrorResponse } from "../../../../../lib/http/api-error.ts";

const schema = z.object({ code: z.string().regex(/^[A-Z0-9]{6}$/u) });

export async function POST(request: Request) {
  try {
    const dependencies = createServerDependencies();
    const userId = resolvePrivateUser(request, dependencies.config.privateUserId);
    if (!dependencies.localDevicePairing) throw new Error("LOCAL_COMPUTER_AGENT_DISABLED");
    const result = await dependencies.localDevicePairing.approve({ ...schema.parse(await request.json()), userId });
    return Response.json({ success: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiErrorResponse(error, "LOCAL_DEVICE_PAIRING"); }
}
