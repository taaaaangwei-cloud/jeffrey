import assert from "node:assert/strict";
import test from "node:test";
import { createGitHubAppInstallationTokenProvider } from "../lib/development/github-app-auth.ts";

function pem(bytes: ArrayBuffer) {
  const base64 = Buffer.from(bytes).toString("base64").match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----`;
}

test("GitHub App authentication targets the configured app and installation only", async () => {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const privateKey = pem(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  let request: { url: string; authorization: string } | undefined;
  const provider = createGitHubAppInstallationTokenProvider({
    appId: "12345", installationId: "67890", privateKey,
    now: () => 1_800_000_000_000,
    async fetch(url, init) {
      request = { url: String(url), authorization: new Headers(init?.headers).get("authorization") ?? "" };
      return Response.json({ token: "installation-token", expires_at: "2030-01-01T00:00:00Z" });
    },
  });

  assert.equal(await provider(), "installation-token");
  assert.equal(request?.url, "https://api.github.com/app/installations/67890/access_tokens");
  const jwt = request?.authorization.replace("Bearer ", "") ?? "";
  const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8")) as { iss: string };
  assert.equal(payload.iss, "12345");
});
