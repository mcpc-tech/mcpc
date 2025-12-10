/**
 * ACP Provider Configuration and Factory
 */

import { ACPLanguageModel } from "./language-model.ts";
import type { Tool } from "ai";
import type { ACPProviderSettings } from "./types.ts";
import type { NewSessionResponse } from "@agentclientprotocol/sdk";

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
  languageModel(modelId?: string, modeId?: string): ACPLanguageModel {
    if (!this.model) {
      this.model = new ACPLanguageModel(modelId, modeId, this.config);
    }
    if (modelId) {
      this.model.modelId = modelId;
    }
    if (modeId) {
      this.model.modeId = modeId;
    }
    return this.model;
  }

  /**
   * Shorthand for creating a language model
   */
  call(): ACPLanguageModel {
    return this.languageModel();
  }

  /**
   * Returns the current session ID if one is active.
   * Useful when `persistSession` is enabled and you need to reference the session later.
   */
  getSessionId(): string | null {
    return this.model?.getSessionId() ?? null;
  }

  /**
   * Initializes the session and returns session info (models, modes, meta).
   * Call this before prompting to discover available options.
   */
  initSession(
    acpTools?:
      | (Array<Tool<any, any> & { name: string }>)
      | Record<string, Tool<any, any>>,
  ): Promise<NewSessionResponse> {
    if (!this.model) {
      this.languageModel();
    }
    return this.model!.initSession(acpTools);
  }

  /**
   * Initializes the connection to the agent process without starting a session.
   * Useful if you need to reduce the time to the first token.
   */
  connect(): Promise<void> {
    if (!this.model) {
      this.languageModel();
    }
    return this.model!.connectClient();
  }

  /**
   * Sets the session mode (e.g., "ask", "plan").
   */
  setMode(modeId: string): Promise<void> {
    if (!this.model) {
      throw new Error("No model initialized. Call languageModel() first.");
    }
    return this.model.setMode(modeId);
  }

  /**
   * Sets the session model.
   */
  setModel(modelId: string): Promise<void> {
    if (!this.model) {
      throw new Error("No model initialized. Call languageModel() first.");
    }
    return this.model.setModel(modelId);
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
 * prompt: "Hello!"
 * });
 * ```
 */
export function createACPProvider(config: ACPProviderSettings): ACPProvider {
  return new ACPProvider(config);
}
