import { z } from "zod";
import { createServerDependencies } from "../../../../lib/server/dependencies.ts";
import { resolvePrivateUser } from "../../../../lib/http/private-user.ts";
import { apiErrorResponse } from "../../../../lib/http/api-error.ts";

const schema = z.object({ endpoint: z.url(), expirationTime: z.number().nullable(), keys: z.object({ p256dh: z.string().min(20).max(500), auth: z.string().min(8).max(200) }) });
export async function POST(request: Request) {
  try { const dependencies = createServerDependencies(); const userId = resolvePrivateUser(request, dependencies.config.privateUserId); await dependencies.push.subscribe(userId, schema.parse(await request.json())); return Response.json({ success: true }); }
  catch (error) { return apiErrorResponse(error, "WEB_PUSH_SUBSCRIBE"); }
}
