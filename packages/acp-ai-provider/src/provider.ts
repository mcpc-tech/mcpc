/**
 * ACP Provider Configuration and Factory
 */

import { ACPLanguageModel } from "./language-model.ts";
import type { ACPProviderSettings } from "./types.ts";
import type { tool } from "ai";

/**
 * ACP Provider - implements AI SDK provider pattern
 *
 * This provider wraps ACP (Agent Client Protocol) agents to work with AI SDK's
 * standard interface, allowing you to use ACP agents through the AI SDK.
 */
export class ACPProvider {
  private config: ACPProviderSettings;
  private model: ACPLanguageModel | null = null;

  constructor(config: ACPProviderSettings) {
    this.config = config;
  }

  /**
   * Create a language model instance for a specific ACP agent
   *
   * @returns A LanguageModelV2 instance
   */
  languageModel(): ACPLanguageModel {
    const modelId = "acp-agent";
    const model = new ACPLanguageModel(modelId, this.config);
    this.model = model;
    return model;
  }

  /**
   * Shorthand for creating a language model
   */
  call(): ACPLanguageModel {
    return this.languageModel();
  }

  /**
   * Provider tools
   */
  get tools(): Record<string, ReturnType<typeof tool>> | undefined {
    return this.model?.tools;
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
