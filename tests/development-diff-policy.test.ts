import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeDevelopmentDiff } from "../lib/development/diff-policy.ts";

test("development diff policy permits product code and tests", () => {
  assert.doesNotThrow(() => assertSafeDevelopmentDiff(["app/page.tsx", "tests/chat-engine.test.ts", "public/icon.png"]));
});

test("development diff policy rejects secrets, customer data, and workflow changes", () => {
  for (const file of [".env", ".env.production", "private-key.pem", "private-data/customer.md", ".github/workflows/release.yml", "knowledge/customer.json"]) {
    assert.throws(() => assertSafeDevelopmentDiff([file]), /FORBIDDEN_DEVELOPMENT_DIFF/);
  }
});
