import { createServerDependencies } from "../../../../lib/server/dependencies.ts";
import { apiErrorResponse } from "../../../../lib/http/api-error.ts";

async function sameSecret(left: string, right: string) {
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  if (a.length !== b.length) return false;
  let difference = 0; for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function POST(request: Request) {
  try {
    const expected = process.env.PROACTIVE_CRON_SECRET ?? "";
    const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/iu, "") ?? "";
    if (expected.length < 32 || !(await sameSecret(expected, supplied))) return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const dependencies = createServerDependencies();
    const { data, error } = await dependencies.supabase.rpc("enqueue_due_proactive_message", { target_user_id: dependencies.config.privateUserId, target_character_id: dependencies.config.defaultCharacterId, target_conversation_id: dependencies.config.defaultConversationId }).maybeSingle();
    if (error) throw error;
    return Response.json({ success: true, queued: Boolean(data) });
  } catch (error) { return apiErrorResponse(error, "PROACTIVE_TICK"); }
}
