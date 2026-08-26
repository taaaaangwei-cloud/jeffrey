import { z } from "zod";
import { createServerDependencies } from "../../../../lib/server/dependencies.ts";
import { resolvePrivateUser } from "../../../../lib/http/private-user.ts";
import { apiErrorResponse } from "../../../../lib/http/api-error.ts";

const updateSchema = z.object({ enabled: z.boolean(), timezone: z.string().min(1).max(100) });

export async function GET(request: Request) {
  try {
    const dependencies = createServerDependencies(); const userId = resolvePrivateUser(request, dependencies.config.privateUserId);
    await dependencies.supabase.from("proactive_settings").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
    const { data, error } = await dependencies.supabase.from("proactive_settings").select("enabled,timezone,quiet_start_hour,quiet_end_hour").eq("user_id", userId).single();
    if (error) throw error; return Response.json({ success: true, settings: data });
  } catch (error) { return apiErrorResponse(error, "PROACTIVE_SETTINGS"); }
}

export async function PATCH(request: Request) {
  try {
    const dependencies = createServerDependencies(); const userId = resolvePrivateUser(request, dependencies.config.privateUserId); const body = updateSchema.parse(await request.json());
    const { error } = await dependencies.supabase.from("proactive_settings").upsert({ user_id: userId, enabled: body.enabled, timezone: body.timezone, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw error; return Response.json({ success: true });
  } catch (error) { return apiErrorResponse(error, "PROACTIVE_SETTINGS"); }
}
