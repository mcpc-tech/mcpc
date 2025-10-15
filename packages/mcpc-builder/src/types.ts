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

export interface MCPConfig {
  mcpServers: Record<
    string,
    {
      command: string;
      args: string[];
      env?: Record<string, string>;
    }
  >;
}

export interface MCPCConfig {
  name: string;
  version: string;
  agents: Array<{
    name: string;
    description: string;
    deps: {
      mcpServers: Record<
        string,
        {
          command: string;
          args: string[];
          env?: Record<string, string>;
        }
      >;
    };
    options?: {
      mode?: "agentic" | "agentic_workflow";
      sampling?: boolean;
    };
  }>;
}
