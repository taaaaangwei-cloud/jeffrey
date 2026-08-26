import type { LocalComputerRiskLevel } from "./types.ts";

export interface LocalApprovalBinding {
  userId: string;
  deviceId: string;
  taskId: string;
  actionId: string | null;
  riskLevel: LocalComputerRiskLevel;
}

interface LocalApprovalPayload extends LocalApprovalBinding {
  expiresAt: number;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function hmac(secret: string, payload: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))));
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

export async function createLocalApprovalToken(secret: string, binding: LocalApprovalBinding, now = Date.now()) {
  const payload: LocalApprovalPayload = { ...binding, expiresAt: now + 15 * 60_000 };
  const encoded = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${encoded}.${await hmac(secret, encoded)}`;
}

export async function verifyLocalApprovalToken(
  secret: string,
  token: string,
  binding: LocalApprovalBinding,
  now = Date.now(),
) {
  const [encoded, providedSignature] = token.split(".");
  if (!encoded || !providedSignature) return false;
  if (!constantTimeEqual(await hmac(secret, encoded), providedSignature)) return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encoded))) as Partial<LocalApprovalPayload>;
    return payload.userId === binding.userId
      && payload.deviceId === binding.deviceId
      && payload.taskId === binding.taskId
      && payload.actionId === binding.actionId
      && payload.riskLevel === binding.riskLevel
      && typeof payload.expiresAt === "number"
      && payload.expiresAt >= now;
  } catch {
    return false;
  }
}
