import type { ToolRegistry } from "./types.ts";

// Intentional no-op: internet chat input must never execute local commands.
export const emptyToolRegistry: ToolRegistry = {
  list: () => [],
};
