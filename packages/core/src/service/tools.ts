// Pure TypeScript type definitions - no Zod dependency needed
interface BaseServerConfig {
  autoApprove?: string[];
  disabled?: boolean;
  disabledReason?: string;
  toolCallTimeout?: number;
}

export interface StdioServerConfig extends BaseServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  transportType?: "stdio";
}

export interface SseServerConfig extends BaseServerConfig {
  url: string;
  transportType?: "sse";
  headers?: Record<string, string>;
}

export interface StreamableHTTPServerConfig extends BaseServerConfig {
  url: string;
  transportType?: "streamable-http";
  headers?: Record<string, string>;
}

export interface InMemoryServerConfig extends BaseServerConfig {
  transportType: "memory";
  server: any; // Server instance from @modelcontextprotocol/sdk
}

// Use explicit union type for better type inference
export type McpServerConfig =
  | StdioServerConfig
  | SseServerConfig
  | StreamableHTTPServerConfig
  | InMemoryServerConfig;

export type MCPSetting = {
  mcpServers: Record<string, McpServerConfig>;
};
