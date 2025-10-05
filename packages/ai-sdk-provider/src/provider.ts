/**
 * MCP Provider Configuration and Factory
 */

import type { LanguageModelV1 } from "@ai-sdk/provider";
import { MCPLanguageModel } from "./language-model.ts";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

/**
 * Configuration for MCP provider
 */
export interface MCPProviderConfig {
  /**
   * MCP client instance to use for sampling
   */
  client: Client;

  /**
   * Optional default model configuration
   */
  modelId?: string;

  /**
   * Optional headers for requests
   */
  headers?: Record<string, string>;

  /**
   * Optional base URL for the MCP server (for display purposes)
   */
  baseUrl?: string;
}

/**
 * Options for creating an MCP language model
 */
export interface MCPProviderOptions {
  /**
   * Override headers for this specific model
   */
  headers?: Record<string, string>;
}

/**
 * MCP Provider - implements AI SDK provider pattern
 *
 * This provider wraps MCP sampling capabilities to work with AI SDK's
 * standard interface, allowing you to use MCP servers and agents
 * through the AI SDK.
 */
export class MCPProvider {
  private config: MCPProviderConfig;

  constructor(config: MCPProviderConfig) {
    this.config = config;
  }

  /**
   * Create a language model instance for a specific MCP tool/agent
   *
   * @param modelId - The MCP tool name to use as the language model
   * @param options - Optional configuration overrides
   * @returns A LanguageModelV1 instance
   */
  languageModel(
    modelId: string,
    options?: MCPProviderOptions,
  ): LanguageModelV1 {
    return new MCPLanguageModel({
      client: this.config.client,
      modelId: modelId,
      baseUrl: this.config.baseUrl,
      headers: {
        ...this.config.headers,
        ...options?.headers,
      },
    });
  }

  /**
   * Shorthand for creating a language model
   */
  call(modelId: string, options?: MCPProviderOptions): LanguageModelV1 {
    return this.languageModel(modelId, options);
  }
}

/**
 * Create an MCP provider instance
 *
 * @example
 * ```typescript
 * import { createMCPProvider } from "@mcpc/ai-sdk-provider";
 * import { Client } from "@modelcontextprotocol/sdk/client/index.js";
 *
 * const client = new Client({
 *   name: "my-client",
 *   version: "1.0.0"
 * }, {
 *   capabilities: {
 *     sampling: {}
 *   }
 * });
 *
 * const provider = createMCPProvider({
 *   client: client
 * });
 *
 * // Use with AI SDK
 * const model = provider("my-agent-tool");
 * ```
 */
export function createMCPProvider(
  config: MCPProviderConfig,
): MCPProvider {
  return new MCPProvider(config);
}

/**
 * Helper to create a provider that can be called directly as a function
 *
 * @example
 * ```typescript
 * const mcp = createMCPProvider({ client });
 * const model = mcp("agent-name");
 * ```
 */
export function createMCP(
  config: MCPProviderConfig,
): (modelId: string, options?: MCPProviderOptions) => LanguageModelV1 {
  const provider = new MCPProvider(config);
  return (modelId: string, options?: MCPProviderOptions) =>
    provider.languageModel(modelId, options);
}
