import assert from "node:assert/strict";
import test from "node:test";
import { signDevelopmentCallback, verifyDevelopmentCallback } from "../lib/development/callback-signature.ts";

test("callback signatures bind body, timestamp, and event id", async () => {
  const input = { secret: "a".repeat(32), body: '{"status":"running"}', timestamp: "1800000000", eventId: "event-1" };
  const signature = await signDevelopmentCallback(input);
  assert.equal(await verifyDevelopmentCallback({ ...input, signature, now: 1_800_000_000_000 }), true);
  assert.equal(await verifyDevelopmentCallback({ ...input, body: "{}", signature, now: 1_800_000_000_000 }), false);
  assert.equal(await verifyDevelopmentCallback({ ...input, signature, now: 1_800_001_000_000 }), false);
});
