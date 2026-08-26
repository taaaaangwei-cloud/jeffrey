import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryLocalComputerRepository } from "../lib/local-computer/memory-repository.ts";
import { createLocalDevicePairingService } from "../lib/local-computer/pairing-service.ts";

const owner = "11111111-1111-4111-8111-111111111111";

test("a ten-minute pairing code can be completed only once", async () => {
  const repository = createMemoryLocalComputerRepository();
  const pairing = createLocalDevicePairingService({ repository, pairingSecret: "pairing-secret-at-least-thirty-two-characters" });
  const invitation = await pairing.start({ publicKey: "p256-public", name: "客户的 Mac", agentVersion: "0.1.0" });
  await pairing.approve({ code: invitation.code, userId: owner });
  const paired = await pairing.finish({ code: invitation.code, claimToken: invitation.claimToken });
  assert.equal(paired.device.userId, owner);
  assert.ok(paired.sessionToken);
  await assert.rejects(() => pairing.finish({ code: invitation.code, claimToken: invitation.claimToken }), /LOCAL_PAIRING_CODE_INVALID/);
});

test("a new pairing revokes the previous Mac", async () => {
  const repository = createMemoryLocalComputerRepository();
  const pairing = createLocalDevicePairingService({ repository, pairingSecret: "pairing-secret-at-least-thirty-two-characters" });
  const firstInvitation = await pairing.start({ publicKey: "key-1", name: "Mac 1", agentVersion: "0.1.0" });
  await pairing.approve({ code: firstInvitation.code, userId: owner });
  const first = await pairing.finish({ code: firstInvitation.code, claimToken: firstInvitation.claimToken });
  const secondInvitation = await pairing.start({ publicKey: "key-2", name: "Mac 2", agentVersion: "0.1.0" });
  await pairing.approve({ code: secondInvitation.code, userId: owner });
  const second = await pairing.finish({ code: secondInvitation.code, claimToken: secondInvitation.claimToken });
  assert.ok((await repository.getDeviceByOwner(first.device.id, owner))?.revokedAt);
  assert.equal((await repository.getActiveDeviceByOwner(owner))?.id, second.device.id);
});

test("only the Mac that created the challenge can finish pairing", async () => {
  const repository = createMemoryLocalComputerRepository();
  const pairing = createLocalDevicePairingService({ repository, pairingSecret: "pairing-secret-at-least-thirty-two-characters" });
  const invitation = await pairing.start({ publicKey: "key", name: "Mac", agentVersion: "0.1.0" });
  await pairing.approve({ code: invitation.code, userId: owner });
  await assert.rejects(() => pairing.finish({ code: invitation.code, claimToken: "wrong-token" }), /LOCAL_PAIRING_CLAIM_INVALID/);
});

test("expired pairing codes fail without creating a device", async () => {
  const repository = createMemoryLocalComputerRepository();
  let now = Date.now();
  const pairing = createLocalDevicePairingService({ repository, pairingSecret: "pairing-secret-at-least-thirty-two-characters", now: () => now });
  const invitation = await pairing.start({ publicKey: "key", name: "Mac", agentVersion: "0.1.0" });
  now += 10 * 60_000 + 1;
  await assert.rejects(() => pairing.approve({ code: invitation.code, userId: owner }), /LOCAL_PAIRING_CODE_EXPIRED/);
  assert.equal(await repository.getActiveDeviceByOwner(owner), null);
});
