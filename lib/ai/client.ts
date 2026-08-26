import OpenAI from "openai";
import type { ServerConfig } from "../config/server.ts";

export function createOpenAIClient(config: ServerConfig) {
  if (config.aiRuntime !== "openai" || !config.openAIKey) throw new Error("OPENAI_RUNTIME_DISABLED");
  return new OpenAI({ apiKey: config.openAIKey });
}
