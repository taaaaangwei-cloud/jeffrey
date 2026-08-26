import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocalAgentNonceStore } from "./device-auth.ts";

function base64Url(bytes: Uint8Array) {
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export async function hashLocalDeviceToken(secret: string, token: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token))));
}

export function createSupabaseDeviceNonceStore(client: SupabaseClient, deviceId: string): LocalAgentNonceStore {
  return {
    async consume(nonce, expiresAt) {
      const nonceHash = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${deviceId}:${nonce}`))));
      const { error } = await client.from("local_agent_nonces").insert({ device_id: deviceId, nonce_hash: nonceHash, expires_at: new Date(expiresAt).toISOString() });
      return !error;
    },
  };
}
