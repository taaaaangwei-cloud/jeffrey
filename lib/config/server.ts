import { z } from "zod";

const serverConfigSchema = z.object({
  AI_RUNTIME: z.enum(["local_codex", "openai"]).default("local_codex"),
  PRIVATE_USER_ID: z.string().uuid(),
  DEFAULT_CHARACTER_ID: z.string().uuid(),
  DEFAULT_CONVERSATION_ID: z.string().uuid(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).optional(),
  OPENAI_EMBEDDING_MODEL: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
}).superRefine((value, context) => {
  if (value.AI_RUNTIME === "openai" && (!value.OPENAI_API_KEY || !value.OPENAI_MODEL || !value.OPENAI_EMBEDDING_MODEL)) {
    context.addIssue({ code: "custom", message: "OpenAI runtime requires server-only model credentials" });
  }
});

const previewConfigSchema = z.object({
  PREVIEW_MODE: z.literal("true"),
  PRIVATE_USER_ID: z.string().uuid(),
  DEEPSEEK_API_KEY: z.string().min(1),
  DEEPSEEK_MODEL: z.string().min(1).default("deepseek-v4-pro"),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com"),
});

const developmentAgentConfigSchema = z.object({
  DEVELOPMENT_AGENT_ENABLED: z.enum(["true", "false"]).default("false"),
  GITHUB_REPOSITORY: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
  GITHUB_APP_ID: z.string().min(1),
  GITHUB_APP_INSTALLATION_ID: z.string().min(1),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1),
  DEVELOPMENT_CALLBACK_SECRET: z.string().min(32),
  DEVELOPMENT_APPROVAL_SECRET: z.string().min(32),
  DEVELOPMENT_TASK_MAX_MINUTES: z.coerce.number().int().min(5).max(120).default(20),
});

const localComputerAgentConfigSchema = z.object({
  LOCAL_COMPUTER_AGENT_ENABLED: z.enum(["true", "false"]).default("false"),
  LOCAL_AGENT_PAIRING_SECRET: z.string().min(32),
  LOCAL_AGENT_DEVICE_TOKEN_SECRET: z.string().min(32),
  LOCAL_AGENT_APPROVAL_SECRET: z.string().min(32),
  LOCAL_AGENT_TASK_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(15),
  LOCAL_AGENT_LEASE_SECONDS: z.coerce.number().int().min(15).max(300).default(60),
  LOCAL_AGENT_MIN_VERSION: z.string().regex(/^\d+\.\d+\.\d+$/u).default("0.1.0"),
});

export class ServerConfigurationError extends Error {
  readonly publicMessage = "Server configuration missing";

  constructor() {
    super("Required server environment variables are missing or invalid");
    this.name = "ServerConfigurationError";
  }
}

export interface ServerConfig {
  aiRuntime: "local_codex" | "openai";
  privateUserId: string;
  defaultCharacterId: string;
  defaultConversationId: string;
  openAIKey?: string;
  openAIModel?: string;
  embeddingModel?: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}

export interface PreviewConfig {
  privateUserId: string;
  deepSeekKey: string;
  deepSeekModel: string;
  deepSeekBaseUrl: string;
}

export interface DevelopmentAgentConfig {
  enabled: boolean;
  configured: boolean;
  maxMinutes: number;
  repository?: string;
  githubAppId?: string;
  githubInstallationId?: string;
  githubPrivateKey?: string;
  callbackSecret?: string;
  approvalSecret?: string;
}

export interface LocalComputerAgentConfig {
  enabled: boolean;
  configured: boolean;
  taskTtlMinutes: number;
  leaseSeconds: number;
  minVersion: string;
  pairingSecret?: string;
  deviceTokenSecret?: string;
  approvalSecret?: string;
}

export interface WebPushConfig { configured: boolean; publicKey?: string; privateKey?: string; subject?: string }

export function getWebPushConfig(source: Record<string, string | undefined> = process.env): WebPushConfig {
  const publicKey = source.VAPID_PUBLIC_KEY?.trim(); const privateKey = source.VAPID_PRIVATE_KEY?.trim(); const subject = source.VAPID_SUBJECT?.trim();
  return publicKey && privateKey && subject && /^(mailto:|https:)/u.test(subject) ? { configured: true, publicKey, privateKey, subject } : { configured: false };
}

export function getServerConfig(source: Record<string, string | undefined> = process.env): ServerConfig {
  const parsed = serverConfigSchema.safeParse(source);
  if (!parsed.success) throw new ServerConfigurationError();
  return {
    aiRuntime: parsed.data.AI_RUNTIME,
    privateUserId: parsed.data.PRIVATE_USER_ID,
    defaultCharacterId: parsed.data.DEFAULT_CHARACTER_ID,
    defaultConversationId: parsed.data.DEFAULT_CONVERSATION_ID,
    openAIKey: parsed.data.OPENAI_API_KEY,
    openAIModel: parsed.data.OPENAI_MODEL,
    embeddingModel: parsed.data.OPENAI_EMBEDDING_MODEL,
    supabaseUrl: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    supabaseServiceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
  };
}

export function getPreviewConfig(source: Record<string, string | undefined> = process.env): PreviewConfig {
  const parsed = previewConfigSchema.safeParse(source);
  if (!parsed.success) throw new ServerConfigurationError();
  return {
    privateUserId: parsed.data.PRIVATE_USER_ID,
    deepSeekKey: parsed.data.DEEPSEEK_API_KEY,
    deepSeekModel: parsed.data.DEEPSEEK_MODEL,
    deepSeekBaseUrl: parsed.data.DEEPSEEK_BASE_URL,
  };
}

export function getDevelopmentAgentConfig(source: Record<string, string | undefined> = process.env): DevelopmentAgentConfig {
  const enabled = source.DEVELOPMENT_AGENT_ENABLED === "true";
  const maxMinutes = Number(source.DEVELOPMENT_TASK_MAX_MINUTES ?? 20);
  const parsed = developmentAgentConfigSchema.safeParse(source);
  if (!parsed.success) return { enabled, configured: false, maxMinutes: Number.isFinite(maxMinutes) ? maxMinutes : 20 };
  return {
    enabled: parsed.data.DEVELOPMENT_AGENT_ENABLED === "true",
    configured: true,
    maxMinutes: parsed.data.DEVELOPMENT_TASK_MAX_MINUTES,
    repository: parsed.data.GITHUB_REPOSITORY,
    githubAppId: parsed.data.GITHUB_APP_ID,
    githubInstallationId: parsed.data.GITHUB_APP_INSTALLATION_ID,
    githubPrivateKey: parsed.data.GITHUB_APP_PRIVATE_KEY,
    callbackSecret: parsed.data.DEVELOPMENT_CALLBACK_SECRET,
    approvalSecret: parsed.data.DEVELOPMENT_APPROVAL_SECRET,
  };
}

export function getLocalComputerAgentConfig(source: Record<string, string | undefined> = process.env): LocalComputerAgentConfig {
  const enabled = source.LOCAL_COMPUTER_AGENT_ENABLED === "true";
  const taskTtlMinutes = Number(source.LOCAL_AGENT_TASK_TTL_MINUTES ?? 15);
  const leaseSeconds = Number(source.LOCAL_AGENT_LEASE_SECONDS ?? 60);
  const minVersion = source.LOCAL_AGENT_MIN_VERSION ?? "0.1.0";
  const fallback = {
    enabled,
    configured: false,
    taskTtlMinutes: Number.isFinite(taskTtlMinutes) ? taskTtlMinutes : 15,
    leaseSeconds: Number.isFinite(leaseSeconds) ? leaseSeconds : 60,
    minVersion,
  };
  const parsed = localComputerAgentConfigSchema.safeParse(source);
  if (!parsed.success) return fallback;
  const secrets = [parsed.data.LOCAL_AGENT_PAIRING_SECRET, parsed.data.LOCAL_AGENT_DEVICE_TOKEN_SECRET, parsed.data.LOCAL_AGENT_APPROVAL_SECRET];
  const developmentSecrets = [source.DEVELOPMENT_CALLBACK_SECRET, source.DEVELOPMENT_APPROVAL_SECRET].filter(Boolean);
  if (new Set(secrets).size !== secrets.length || secrets.some((secret) => developmentSecrets.includes(secret))) return fallback;
  return {
    enabled: parsed.data.LOCAL_COMPUTER_AGENT_ENABLED === "true",
    configured: true,
    taskTtlMinutes: parsed.data.LOCAL_AGENT_TASK_TTL_MINUTES,
    leaseSeconds: parsed.data.LOCAL_AGENT_LEASE_SECONDS,
    minVersion: parsed.data.LOCAL_AGENT_MIN_VERSION,
    pairingSecret: parsed.data.LOCAL_AGENT_PAIRING_SECRET,
    deviceTokenSecret: parsed.data.LOCAL_AGENT_DEVICE_TOKEN_SECRET,
    approvalSecret: parsed.data.LOCAL_AGENT_APPROVAL_SECRET,
  };
}
