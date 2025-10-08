/**
 * MCP Provider Configuration and Factory
 */

import type { LanguageModelV2 } from "@ai-sdk/provider";
import { MCPSamplingLanguageModel } from "./language-model.ts";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

/**
 * Extract the modelPreferences type from MCP SDK's createMessage method
 */
type CreateMessageParams = Parameters<Server["createMessage"]>[0];
export type ModelPreferences = CreateMessageParams["modelPreferences"];

/**
 * Configuration for MCP provider
 */
export interface MCPSamplingProviderConfig {
  /**
   * MCP server instance with sampling capability
   */
  server: Server;
}

/**
 * Options for creating an MCP language model
 */
export interface MCPSamplingProviderOptions {
  /**
   * Override model preferences for this specific model
   * See: https://modelcontextprotocol.io/specification/2025-06-18/client/sampling#model-preferences
   */
  modelPreferences?: ModelPreferences;
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
   * @param options - Optional configuration overrides
   * @returns A LanguageModelV2 instance
   */
  languageModel(options?: MCPSamplingProviderOptions): LanguageModelV2 {
    return new MCPSamplingLanguageModel({
      server: this.config.server,
      modelPreferences: options?.modelPreferences,
    });
  }

  /**
   * Shorthand for creating a language model
   */
  call(options?: MCPSamplingProviderOptions): LanguageModelV2 {
    return this.languageModel(options);
  }
}

/**
 * Create an MCP sampling provider instance
 *
 * @example
 * ```typescript
 * import { createMCPSamplingProvider } from "@mcpc/mcp-sampling-ai-provider";
 * import { Server } from "@modelcontextprotocol/sdk/server/index.js";
 *
 * const server = new Server(
 *   { name: "my-agent", version: "1.0.0" },
 *   { capabilities: { sampling: {}, tools: {} } }
 * );
 *
 * const provider = createMCPSamplingProvider({ server });
 *
 * // Use with AI SDK
 * const model = provider.languageModel({
 *   modelPreferences: { hints: [{ name: "copilot/gpt-5-mini" }] }
 * });
 * ```
 */
export function createMCPSamplingProvider(
  config: MCPSamplingProviderConfig,
): MCPSamplingProvider {
  return new MCPSamplingProvider(config);
}
