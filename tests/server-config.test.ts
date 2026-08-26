import assert from "node:assert/strict";
import test from "node:test";
import { getDevelopmentAgentConfig, getLocalComputerAgentConfig, getPreviewConfig, getServerConfig, getWebPushConfig, ServerConfigurationError } from "../lib/config/server.ts";

test("missing server credentials produce a stable public configuration error", () => {
  assert.throws(
    () => getServerConfig({}),
    (error) => error instanceof ServerConfigurationError && error.publicMessage === "Server configuration missing",
  );
});

test("DeepSeek preview requires an explicit server-only preview configuration", () => {
  const config = getPreviewConfig({
    PREVIEW_MODE: "true",
    PRIVATE_USER_ID: "11111111-1111-4111-8111-111111111111",
    DEEPSEEK_API_KEY: "server-key",
    DEEPSEEK_MODEL: "deepseek-v4-pro",
    DEEPSEEK_BASE_URL: "https://api.deepseek.com",
  });
  assert.equal(config.deepSeekModel, "deepseek-v4-pro");
  assert.equal(config.deepSeekBaseUrl, "https://api.deepseek.com");
});

test("server configuration reads private credentials without exposing aliases", () => {
  const config = getServerConfig({
    PRIVATE_USER_ID: "11111111-1111-4111-8111-111111111111",
    DEFAULT_CHARACTER_ID: "22222222-2222-4222-8222-222222222222",
    DEFAULT_CONVERSATION_ID: "33333333-3333-4333-8333-333333333333",
    OPENAI_API_KEY: "server-key",
    OPENAI_MODEL: "configured-chat-model",
    OPENAI_EMBEDDING_MODEL: "configured-embedding-model",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
  });

  assert.equal(config.openAIModel, "configured-chat-model");
  assert.equal(config.embeddingModel, "configured-embedding-model");
  assert.equal("NEXT_PUBLIC_OPENAI_API_KEY" in config, false);
});

test("local Codex runtime starts without an OpenAI API key", () => {
  const config = getServerConfig({
    AI_RUNTIME: "local_codex",
    PRIVATE_USER_ID: "11111111-1111-4111-8111-111111111111",
    DEFAULT_CHARACTER_ID: "22222222-2222-4222-8222-222222222222",
    DEFAULT_CONVERSATION_ID: "33333333-3333-4333-8333-333333333333",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
  });
  assert.equal(config.aiRuntime, "local_codex");
  assert.equal(config.openAIKey, undefined);
  assert.throws(() => getServerConfig({ ...{
    AI_RUNTIME: "openai", PRIVATE_USER_ID: config.privateUserId, DEFAULT_CHARACTER_ID: config.defaultCharacterId,
    DEFAULT_CONVERSATION_ID: config.defaultConversationId, NEXT_PUBLIC_SUPABASE_URL: config.supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: config.supabaseServiceRoleKey,
  } }), ServerConfigurationError);
});

test("Web Push is ready only with a complete server-only VAPID configuration", () => {
  assert.deepEqual(getWebPushConfig({}), { configured: false });
  const config = getWebPushConfig({ VAPID_PUBLIC_KEY: "public", VAPID_PRIVATE_KEY: "private", VAPID_SUBJECT: "mailto:owner@example.com" });
  assert.equal(config.configured, true);
  assert.equal(config.privateKey, "private");
});

test("the development agent is disabled by default and missing secrets never break chat configuration", () => {
  assert.deepEqual(getDevelopmentAgentConfig({}), {
    enabled: false,
    configured: false,
    maxMinutes: 20,
  });

  const config = getDevelopmentAgentConfig({ DEVELOPMENT_AGENT_ENABLED: "true", GITHUB_REPOSITORY: "customer/private-app" });
  assert.equal(config.enabled, true);
  assert.equal(config.configured, false);
  assert.equal(JSON.stringify(config).includes("PRIVATE_KEY"), false);
});

test("local computer control is disabled by default and incomplete configuration is never marked ready", () => {
  assert.deepEqual(getLocalComputerAgentConfig({}), {
    enabled: false,
    configured: false,
    taskTtlMinutes: 15,
    leaseSeconds: 60,
    minVersion: "0.1.0",
  });
  const incomplete = getLocalComputerAgentConfig({ LOCAL_COMPUTER_AGENT_ENABLED: "true", LOCAL_AGENT_PAIRING_SECRET: "x".repeat(32) });
  assert.equal(incomplete.enabled, true);
  assert.equal(incomplete.configured, false);
});

test("local computer control requires three distinct server-only secrets and bounded timing", () => {
  const source = {
    LOCAL_COMPUTER_AGENT_ENABLED: "true",
    LOCAL_AGENT_PAIRING_SECRET: "p".repeat(32),
    LOCAL_AGENT_DEVICE_TOKEN_SECRET: "d".repeat(32),
    LOCAL_AGENT_APPROVAL_SECRET: "a".repeat(32),
    LOCAL_AGENT_TASK_TTL_MINUTES: "20",
    LOCAL_AGENT_LEASE_SECONDS: "90",
    LOCAL_AGENT_MIN_VERSION: "1.2.3",
    DEVELOPMENT_APPROVAL_SECRET: "z".repeat(32),
    DEVELOPMENT_CALLBACK_SECRET: "y".repeat(32),
  };
  const config = getLocalComputerAgentConfig(source);
  assert.equal(config.configured, true);
  assert.equal(config.taskTtlMinutes, 20);
  assert.equal(config.leaseSeconds, 90);

  assert.equal(getLocalComputerAgentConfig({ ...source, LOCAL_AGENT_APPROVAL_SECRET: source.LOCAL_AGENT_PAIRING_SECRET }).configured, false);
  assert.equal(getLocalComputerAgentConfig({ ...source, LOCAL_AGENT_TASK_TTL_MINUTES: "1" }).configured, false);
  assert.equal(getLocalComputerAgentConfig({ ...source, LOCAL_AGENT_APPROVAL_SECRET: source.DEVELOPMENT_APPROVAL_SECRET }).configured, false);
});
