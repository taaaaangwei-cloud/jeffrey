export interface ToolDefinition {
  name: string;
  description: string;
}

export interface ToolRegistry {
  list(): readonly ToolDefinition[];
}
