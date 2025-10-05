/**
 * MCP Provider Configuration and Factory
 */

import type { LanguageModelV2 } from "@ai-sdk/provider";
import { MCPSamplingLanguageModel } from "./language-model.ts";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

/**
 * Configuration for MCP provider
 */
export interface MCPSamplingProviderConfig {
  /**
   * MCP server instance with sampling capability
   */
  server: Server;

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
export interface MCPSamplingProviderOptions {
  /**
   * Override headers for this specific model
   */
  headers?: Record<string, string>;
}

/**
 * MCP Provider - implements AI SDK provider pattern
 *
 * This provider wraps MCP's createMessage capability to work with AI SDK's
 * standard interface, allowing you to use MCP servers and agents
 * through the AI SDK.
 */
export class MCPSamplingProvider {
  private config: MCPSamplingProviderConfig;

  constructor(config: MCPSamplingProviderConfig) {
    this.config = config;
  }

  /**
   * Create a language model instance for a specific MCP tool/agent
   *
   * @param modelId - The MCP tool name to use as the language model
   * @param options - Optional configuration overrides
   * @returns A LanguageModelV2 instance
   */
  languageModel(
    modelId: string,
    options?: MCPSamplingProviderOptions,
  ): LanguageModelV2 {
    return new MCPSamplingLanguageModel({
      server: this.config.server,
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
  call(modelId: string, options?: MCPSamplingProviderOptions): LanguageModelV2 {
    return this.languageModel(modelId, options);
  }
}

/**
 * Create an MCP sampling provider instance
 *
 * @example
 * ```typescript
 * import { createMCPSamplingProvider } from "@mcpc/ai-sdk-mcp-sampling-provider";
 * import { mcpc } from "@mcpc/core";
 *
 * const server = await mcpc(
 *   [{ name: "my-agent", version: "1.0.0" }, { capabilities: { sampling: {} } }],
 *   [{ name: "my-agent", description: "...", options: { sampling: true } }]
 * );
 *
 * const provider = createMCPSamplingProvider({
 *   server: server
 * });
 *
 * // Use with AI SDK
 * const model = provider.languageModel("my-agent");
 * ```
 */
export function createMCPSamplingProvider(
  config: MCPSamplingProviderConfig,
): MCPSamplingProvider {
  return new MCPSamplingProvider(config);
}
