import type { LocalComputerRepository } from "./repository.ts";

export interface PairingChallenge {
  codeHash: string;
  publicKey: string;
  name: string;
  agentVersion: string;
  expiresAt: number;
  userId?: string;
  claimTokenHash: string;
}

export interface LocalPairingChallengeStore {
  save(challenge: PairingChallenge): Promise<void>;
  approve(codeHash: string, userId: string): Promise<PairingChallenge | null>;
  getApproved(codeHash: string): Promise<PairingChallenge | null>;
  consumeApproved(codeHash: string): Promise<PairingChallenge | null>;
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((value) => (value % 36).toString(36).toUpperCase()).join("");
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

export function createLocalDevicePairingService({
  repository,
  pairingSecret,
  deviceTokenSecret = pairingSecret,
  challengeStore,
  now = () => Date.now(),
}: {
  repository: LocalComputerRepository;
  pairingSecret: string;
  deviceTokenSecret?: string;
  challengeStore?: LocalPairingChallengeStore;
  now?: () => number;
}) {
  const challenges = new Map<string, PairingChallenge>();
  const store: LocalPairingChallengeStore = challengeStore ?? {
    async save(challenge) { challenges.set(challenge.codeHash, challenge); },
    async approve(codeHash, userId) { const value = challenges.get(codeHash); if (!value || value.userId) return null; const approved = { ...value, userId }; challenges.set(codeHash, approved); return approved; },
    async getApproved(codeHash) { const value = challenges.get(codeHash) ?? null; return value?.userId ? value : null; },
    async consumeApproved(codeHash) { const value = challenges.get(codeHash) ?? null; if (!value?.userId) return null; challenges.delete(codeHash); return value; },
  };

  return {
    async start(command: { publicKey: string; name: string; agentVersion: string }) {
      const code = randomCode();
      const expiresAt = now() + 10 * 60_000;
      const codeHash = await hmac(pairingSecret, code);
      const claimToken = base64Url(crypto.getRandomValues(new Uint8Array(32)));
      const claimTokenHash = await hmac(pairingSecret, claimToken);
      await store.save({ codeHash, claimTokenHash, ...command, expiresAt });
      return { code, claimToken, expiresAt: new Date(expiresAt).toISOString() };
    },

    async approve(command: { code: string; userId: string }) {
      const codeHash = await hmac(pairingSecret, command.code.toUpperCase());
      const challenge = await store.approve(codeHash, command.userId);
      if (!challenge) throw new Error("LOCAL_PAIRING_CODE_INVALID");
      if (challenge.expiresAt < now()) {
        throw new Error("LOCAL_PAIRING_CODE_EXPIRED");
      }
      return { approved: true as const, expiresAt: new Date(challenge.expiresAt).toISOString() };
    },

    async finish(command: { code: string; claimToken: string }) {
      const codeHash = await hmac(pairingSecret, command.code.toUpperCase());
      const pending = await store.getApproved(codeHash);
      if (!pending) throw new Error("LOCAL_PAIRING_CODE_INVALID");
      if (pending.claimTokenHash !== await hmac(pairingSecret, command.claimToken)) throw new Error("LOCAL_PAIRING_CLAIM_INVALID");
      const challenge = await store.consumeApproved(codeHash);
      if (!challenge?.userId) throw new Error("LOCAL_PAIRING_CODE_INVALID");
      if (challenge.expiresAt < now()) throw new Error("LOCAL_PAIRING_CODE_EXPIRED");

      const issuedAt = now();
      const tokenPayload = `${challenge.userId}.${issuedAt}.${crypto.randomUUID()}`;
      const sessionToken = `${tokenPayload}.${await hmac(pairingSecret, tokenPayload)}`;
      const tokenHash = await hmac(deviceTokenSecret, sessionToken);
      const device = await repository.pairDevice({
        userId: challenge.userId,
        name: challenge.name,
        publicKey: challenge.publicKey,
        agentVersion: challenge.agentVersion,
        tokenHash,
        tokenExpiresAt: new Date(issuedAt + 60 * 60_000).toISOString(),
      });
      return { device, sessionToken };
    },
  };
}
