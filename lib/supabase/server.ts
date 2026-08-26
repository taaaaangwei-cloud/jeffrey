import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerConfig, type ServerConfig } from "../config/server.ts";

export function createServerSupabase(config: ServerConfig = getServerConfig()): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "jeffrey-private-pwa" } },
  });
}
