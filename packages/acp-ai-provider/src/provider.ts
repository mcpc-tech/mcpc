/**
 * ACP Provider Configuration and Factory
 */

import type { LanguageModelV2 } from "@ai-sdk/provider";
import { ACPLanguageModel } from "./language-model.ts";
import type { ACPProviderSettings } from "./types.ts";

/**
 * ACP Provider - implements AI SDK provider pattern
 *
 * This provider wraps ACP (Agent Client Protocol) agents to work with AI SDK's
 * standard interface, allowing you to use ACP agents through the AI SDK.
 */
export class ACPProvider {
  private config: ACPProviderSettings;

  constructor(config: ACPProviderSettings) {
    this.config = config;
  }

  /**
   * Create a language model instance for a specific ACP agent
   *
   * @returns A LanguageModelV2 instance
   */
  languageModel(): LanguageModelV2 {
    const modelId = "acp-agent";

    return new ACPLanguageModel(modelId, this.config);
  }

  /**
   * Shorthand for creating a language model
   */
  call(): LanguageModelV2 {
    return this.languageModel();
  }
}

/**
 * Create an ACP provider instance
 *
 * @example
 * ```typescript
 * import { createACPProvider } from "@mcpc/acp-client-ai-provider";
 * import { generateText } from "ai";
 *
 * // See ACPProviderSettings in types.ts for all required fields
 * const provider = createACPProvider({
 *   // Process configuration
 *   command: "gemini",                    // Required: Command to execute the ACP agent
 *   args: ["--experimental-acp"],         // Optional: Arguments to pass to the command
 *   env: {},                              // Optional: Environment variables for the agent process
 *
 *   // ACP protocol configuration
 *   session: {                            // Required: Session configuration (NewSessionRequest)
 *     cwd: process.cwd(),
 *     mcpServers: [],
 *   },
 *   // initialize: {                       // Optional: Initialize configuration (InitializeRequest)
 *   //   protocolVersion: 1,
 *   //   clientCapabilities: {
 *   //     fs: { readTextFile: false, writeTextFile: false },
 *   //     terminal: false,
 *   //   },
 *   // },
 * });
 *
 * // Use with AI SDK
 * const result = await generateText({
 *   model: provider.languageModel(),
 *   prompt: "Hello, world!"
 * });
 * ```
 */
export function createACPProvider(config: ACPProviderSettings): ACPProvider {
  return new ACPProvider(config);
}
