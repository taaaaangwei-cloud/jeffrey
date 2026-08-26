import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocalPairingChallengeStore, PairingChallenge } from "./pairing-service.ts";

export function createSupabaseLocalPairingChallengeStore(client: SupabaseClient): LocalPairingChallengeStore {
  return {
    async save(challenge) {
      const { error } = await client.from("local_pairing_challenges").insert({ code_hash: challenge.codeHash, claim_token_hash: challenge.claimTokenHash, public_key: challenge.publicKey, device_name: challenge.name, agent_version: challenge.agentVersion, expires_at: new Date(challenge.expiresAt).toISOString() });
      if (error) throw error;
    },
    async approve(codeHash, userId) {
      const { data, error } = await client.rpc("approve_local_pairing_challenge", { target_code_hash: codeHash, target_user_id: userId }).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as Record<string, unknown>;
      return { codeHash: String(row.code_hash), claimTokenHash: String(row.claim_token_hash), publicKey: String(row.public_key), name: String(row.device_name), agentVersion: String(row.agent_version), expiresAt: Date.parse(String(row.expires_at)), userId: String(row.authorized_user_id) } satisfies PairingChallenge;
    },
    async getApproved(codeHash) {
      const { data, error } = await client.from("local_pairing_challenges").select("*").eq("code_hash", codeHash).is("consumed_at", null).not("authorized_user_id", "is", null).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as Record<string, unknown>;
      return { codeHash: String(row.code_hash), claimTokenHash: String(row.claim_token_hash), publicKey: String(row.public_key), name: String(row.device_name), agentVersion: String(row.agent_version), expiresAt: Date.parse(String(row.expires_at)), userId: String(row.authorized_user_id) } satisfies PairingChallenge;
    },
    async consumeApproved(codeHash) {
      const { data, error } = await client.rpc("consume_local_pairing_challenge", { target_code_hash: codeHash }).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as Record<string, unknown>;
      return { codeHash: String(row.code_hash), claimTokenHash: String(row.claim_token_hash), publicKey: String(row.public_key), name: String(row.device_name), agentVersion: String(row.agent_version), expiresAt: Date.parse(String(row.expires_at)), userId: String(row.authorized_user_id) } satisfies PairingChallenge;
    },
  };
}
