import { z } from "zod";
import { createServerDependencies } from "../../../../../lib/server/dependencies.ts";
import { apiErrorResponse } from "../../../../../lib/http/api-error.ts";

const schema = z.object({ publicKey: z.string().min(20).max(5000), name: z.string().min(1).max(80), agentVersion: z.string().regex(/^\d+\.\d+\.\d+$/u) });

export async function POST(request: Request) {
  try {
    const dependencies = createServerDependencies();
    if (!dependencies.localDevicePairing) throw new Error("LOCAL_COMPUTER_AGENT_DISABLED");
    const invitation = await dependencies.localDevicePairing.start(schema.parse(await request.json()));
    return Response.json({ success: true, ...invitation }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiErrorResponse(error, "LOCAL_AGENT_PAIRING"); }
}
