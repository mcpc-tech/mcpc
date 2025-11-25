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

  /**
   * Returns the current session ID if one is active.
   * Useful when `persistSession` is enabled and you need to reference the session later.
   */
  getSessionId(): string | null {
    return this.model?.getSessionId() ?? null;
  }

  /**
   * Forces cleanup of the connection and session.
   * Call this when you're done with the provider instance, especially when using `persistSession`.
   */
  cleanup(): void {
    this.model?.forceCleanup();
  }
}

/**
 * Create an ACP provider instance
 *
 * @example
 * ```typescript
 * const provider = createACPProvider({
 *   command: "gemini",
 *   args: ["--experimental-acp"],
 *   session: { cwd: process.cwd(), mcpServers: [] },
 * });
 *
 * const result = await generateText({
 *   model: provider.languageModel(),
 *   prompt: "Hello!"
 * });
 * ```
 */
export function createACPProvider(config: ACPProviderSettings): ACPProvider {
  return new ACPProvider(config);
}
