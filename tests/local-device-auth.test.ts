import assert from "node:assert/strict";
import test from "node:test";
import { canonicalLocalAgentRequest, createMemoryNonceStore, verifyLocalAgentSignature } from "../lib/local-computer/device-auth.ts";

async function keyPair() {
  return crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
}

test("a fresh P-256 signed request is accepted once", async () => {
  const keys = await keyPair();
  const publicKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const timestamp = Date.now();
  const request = { method: "POST", path: "/api/local-agent/heartbeat", body: "{}", timestamp, nonce: "nonce-1" };
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, new TextEncoder().encode(await canonicalLocalAgentRequest(request)));
  const signatureText = Buffer.from(signature).toString("base64url");
  const nonces = createMemoryNonceStore();

  assert.equal(await verifyLocalAgentSignature({ ...request, publicKey, signature: signatureText, nonces }), true);
  assert.equal(await verifyLocalAgentSignature({ ...request, publicKey, signature: signatureText, nonces }), false);
});

test("stale timestamps and altered bodies are rejected", async () => {
  const keys = await keyPair();
  const publicKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const timestamp = Date.now() - 6 * 60_000;
  const request = { method: "POST", path: "/api/local-agent/tasks/claim", body: "{}", timestamp, nonce: "nonce-2" };
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, new TextEncoder().encode(await canonicalLocalAgentRequest(request)));
  const signatureText = Buffer.from(signature).toString("base64url");

  assert.equal(await verifyLocalAgentSignature({ ...request, publicKey, signature: signatureText, nonces: createMemoryNonceStore() }), false);
  assert.equal(await verifyLocalAgentSignature({ ...request, timestamp: Date.now(), body: "{\"changed\":true}", publicKey, signature: signatureText, nonces: createMemoryNonceStore() }), false);
});
