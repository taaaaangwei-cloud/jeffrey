import { buildPushPayload } from "@block65/webcrypto-web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WebPushConfig } from "../config/server.ts";

export interface BrowserPushSubscription { endpoint: string; expirationTime: number | null; keys: { p256dh: string; auth: string } }

export function createPushService(client: SupabaseClient, config: WebPushConfig) {
  return {
    async subscribe(userId: string, subscription: BrowserPushSubscription) {
      if (!config.configured) throw new Error("WEB_PUSH_DISABLED");
      const { error } = await client.from("push_subscriptions").upsert({ user_id: userId, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth }, { onConflict: "user_id,endpoint" });
      if (error) throw error;
    },
    async deliver(userId: string, message: { id: string; content: string }) {
      if (!config.configured) return;
      const { data, error } = await client.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", userId);
      if (error) throw error;
      await Promise.all((data ?? []).map(async (row) => {
        const subscription = { endpoint: row.endpoint, expirationTime: null, keys: { p256dh: row.p256dh, auth: row.auth } };
        const payload = await buildPushPayload({ data: JSON.stringify({ title: "Jeffrey", body: message.content.slice(0, 180), messageId: message.id }), options: { ttl: 3600, urgency: "normal", topic: `jeffrey-${message.id}` } }, subscription, { subject: config.subject!, publicKey: config.publicKey!, privateKey: config.privateKey! });
        const response = await fetch(subscription.endpoint, { ...payload, body: Uint8Array.from(payload.body).buffer });
        if (response.status === 404 || response.status === 410) await client.from("push_subscriptions").delete().eq("id", row.id);
        else if (!response.ok) console.error("WEB_PUSH_DELIVERY_ERROR", { status: response.status });
      }));
    },
  };
}
