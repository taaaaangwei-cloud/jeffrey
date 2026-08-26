import assert from "node:assert/strict";
import test from "node:test";
import { parseChatRequest } from "../lib/chat/request.ts";
import { resolvePrivateUser } from "../lib/http/private-user.ts";
import { apiErrorResponse } from "../lib/http/api-error.ts";

const privateUserId = "11111111-1111-4111-8111-111111111111";

test("chat validation rejects unsupported message types and malformed ids", () => {
  assert.throws(() => parseChatRequest({
    characterId: "not-an-id",
    conversationId: "also-not-an-id",
    message: "hello",
    type: "binary",
  }));
});

test("private APIs reject an authenticated user other than the configured owner", () => {
  const request = new Request("https://example.com/api/chat", {
    headers: { "oai-authenticated-user-id": "99999999-9999-4999-8999-999999999999" },
  });
  assert.throws(() => resolvePrivateUser(request, privateUserId, true), /FORBIDDEN/);
});

test("local development uses the configured private owner when dispatch headers are absent", () => {
  const request = new Request("http://localhost/api/chat");
  assert.equal(resolvePrivateUser(request, privateUserId, false), privateUserId);
});

test("a non-UUID Sites identity can map to the private database owner UUID", () => {
  const request = new Request("https://example.com/api/chat", {
    headers: { "oai-authenticated-user-id": "sites-user-id" },
  });
  assert.equal(resolvePrivateUser(request, privateUserId, true, "sites-user-id"), privateUserId);
});

test("chat failures return a stable public error without provider details", async () => {
  const response = apiErrorResponse(new Error("sk-secret database-password"), "CHAT");
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { success: false, error: "Chat request failed" });
});
