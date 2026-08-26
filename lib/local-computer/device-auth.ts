export interface LocalAgentNonceStore {
  consume(nonce: string, expiresAt: number): Promise<boolean>;
}

export interface CanonicalLocalAgentRequest {
  method: string;
  path: string;
  body: string;
  timestamp: number;
  nonce: string;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

async function sha256(value: string) {
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

export async function canonicalLocalAgentRequest(request: CanonicalLocalAgentRequest) {
  return [request.method.toUpperCase(), request.path, String(request.timestamp), request.nonce, await sha256(request.body)].join("\n");
}

export function createMemoryNonceStore(): LocalAgentNonceStore {
  const seen = new Map<string, number>();
  return {
    async consume(nonce, expiresAt) {
      const now = Date.now();
      for (const [value, expiry] of seen) if (expiry < now) seen.delete(value);
      if (seen.has(nonce)) return false;
      seen.set(nonce, expiresAt);
      return true;
    },
  };
}

export async function verifyLocalAgentSignature(input: CanonicalLocalAgentRequest & {
  publicKey: JsonWebKey;
  signature: string;
  nonces: LocalAgentNonceStore;
  now?: number;
  maxSkewMs?: number;
}) {
  const now = input.now ?? Date.now();
  const maxSkewMs = input.maxSkewMs ?? 5 * 60_000;
  if (!input.nonce || Math.abs(now - input.timestamp) > maxSkewMs) return false;
  try {
    const key = await crypto.subtle.importKey("jwk", input.publicKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      base64UrlToBytes(input.signature),
      new TextEncoder().encode(await canonicalLocalAgentRequest(input)),
    );
    if (!valid) return false;
    return input.nonces.consume(input.nonce, now + maxSkewMs);
  } catch {
    return false;
  }
}
