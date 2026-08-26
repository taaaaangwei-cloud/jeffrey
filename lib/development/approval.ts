function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function hmac(secret: string, payload: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))));
}

export async function createReleaseApprovalToken(secret: string, taskId: string, previewSha: string, now = Date.now()) {
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ taskId, previewSha, expiresAt: now + 15 * 60_000 })));
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function verifyReleaseApprovalToken(secret: string, token: string, taskId: string, previewSha: string, now = Date.now()) {
  const [payload, providedSignature] = token.split(".");
  if (!payload || !providedSignature) return false;
  const expectedSignature = await hmac(secret, payload);
  const left = new TextEncoder().encode(expectedSignature);
  const right = new TextEncoder().encode(providedSignature);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  if (difference !== 0) return false;
  try {
    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)))) as { taskId?: string; previewSha?: string; expiresAt?: number };
    return parsed.taskId === taskId && parsed.previewSha === previewSha && typeof parsed.expiresAt === "number" && parsed.expiresAt >= now;
  } catch {
    return false;
  }
}
