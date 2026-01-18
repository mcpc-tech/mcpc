/**
 * Type definitions for MCPC Builder
 */

export interface MCPServer {
  name: string;
  description: string;
  vendor?: string;
  sourceUrl?: string;
  homepage?: string;
  license?: string;
  runtime?: string;
  categories?: string[];
  tags?: string[];
}

export interface ServerCapabilities {
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>;
  resources?: Array<{
    name: string;
    description?: string;
    uri?: string;
  }>;
  prompts?: Array<{
    name: string;
    description?: string;
    arguments?: Array<
      { name: string; description?: string; required?: boolean }
    >;
  }>;
}

export interface ServerDetails extends MCPServer {
  version?: string;
  repository?: {
    url: string;
    source: string;
  };
  package?: {
    registryType: string;
    registryBaseUrl: string;
    identifier: string;
    version: string;
    runtimeHint?: string;
    transport?: {
      type: string;
    };
    environmentVariables?: Array<{
      name: string;
      description?: string;
      isRequired?: boolean;
      isSecret?: boolean;
      default?: string;
      format?: string;
    }>;
    packageArguments?: Array<{
      type: "positional" | "named";
      name?: string;
      value?: string;
      default?: string;
    }>;
  };
  remote?: {
    type: "sse" | "streamable-http";
    url: string;
    headers?: Array<{
      name: string;
      value?: string;
      isRequired?: boolean;
      isSecret?: boolean;
    }>;
  };
  publishedAt?: string;
  updatedAt?: string;
  capabilities?: ServerCapabilities;
  error?: string | null;
  fetchedAt?: string;
  toolNames?: string[];
  resourceUris?: string[];
  promptNames?: string[];
}

export interface SearchResult {
  servers: Array<MCPServer & { toolNames?: string[] }>;
  total: number;
  hasMore: boolean;
}

export interface MCPServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transportType?: "stdio" | "sse" | "streamable-http";
  url?: string;
  headers?: Record<string, string>;
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

export interface ToolSelection {
  serverName: string;
  tools: string[] | "__ALL__"; // specific tools or all tools
}

export interface MCPCConfig {
  name: string;
  version: string;
  agents: Array<{
    name: string;
    description: string;
    deps: {
      mcpServers: Record<string, MCPServerConfig>;
    };
    options?: {
      mode?: "agentic" | "ai_sampling" | "ai_acp";
      sampling?: boolean;
    };
  }>;
}
