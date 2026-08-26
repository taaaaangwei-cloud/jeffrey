function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function signaturePayload(input: { body: string; timestamp: string; eventId: string }) {
  return `${input.timestamp}.${input.eventId}.${input.body}`;
}

export async function signDevelopmentCallback(input: { secret: string; body: string; timestamp: string; eventId: string }) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(input.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signaturePayload(input)));
  return `sha256=${bytesToHex(new Uint8Array(signature))}`;
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

export async function verifyDevelopmentCallback(input: {
  secret: string;
  body: string;
  timestamp: string;
  eventId: string;
  signature: string;
  now?: number;
}) {
  const timestampMs = Number(input.timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs((input.now ?? Date.now()) - timestampMs) > 5 * 60_000) return false;
  const expected = await signDevelopmentCallback(input);
  return constantTimeEqual(expected, input.signature);
}
