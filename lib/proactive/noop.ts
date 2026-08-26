import type { ProactiveMessageService } from "./types.ts";

// Scheduler and Web Push delivery are intentionally deferred.
export const noopProactiveMessageService: ProactiveMessageService = {
  async generate() { return null; },
};
