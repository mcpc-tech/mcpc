/**
 * ACP Provider Configuration and Factory
 */

import { ACPLanguageModel } from "./language-model.ts";
import type { tool } from "ai";
import type { ACPProviderSettings } from "./types.ts";
import type {
  NewSessionResponse,
  SessionConfigOption,
  SessionConfigOptionCategory,
  SetSessionConfigOptionRequest,
  SetSessionConfigOptionResponse,
} from "@agentclientprotocol/sdk";

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
   * Provider tools - includes the agent dynamic tool
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
   * Initializes the session and returns session info (models, modes, meta).
   * Call this before prompting to discover available options.
   */
  initSession(
    tools?: Parameters<ACPLanguageModel["initSession"]>[0],
  ): Promise<NewSessionResponse> {
    if (!this.model) {
      this.languageModel();
    }
    return this.model!.initSession(tools);
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
   * Runs authentication manually.
   *
   * If `methodId` is omitted, falls back to `config.authMethodId`.
   */
  authenticate(methodId?: string): Promise<void> {
    if (!this.model) {
      this.languageModel();
    }

    const resolvedMethodId = methodId ?? this.config.authMethodId;
    if (!resolvedMethodId) {
      throw new Error(
        "No auth method configured. Pass methodId or set authMethodId in ACPProviderSettings.",
      );
    }

    return this.model!.authenticate(resolvedMethodId);
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
   * Returns config options advertised by the active ACP session, optionally
   * filtered by semantic category.
   */
  getConfigOptions(
    category?: SessionConfigOptionCategory,
  ): SessionConfigOption[] {
    return this.model?.getConfigOptions(category) ?? [];
  }

  /**
   * Sets any ACP session config option using its agent-advertised ID.
   */
  setConfigOption(
    configId: string,
    value: SetSessionConfigOptionRequest["value"],
  ): Promise<SetSessionConfigOptionResponse> {
    if (!this.model) {
      throw new Error("No model initialized. Call initSession() first.");
    }
    return this.model.setConfigOption(configId, value);
  }

  /**
   * Sets the single config option advertised for a semantic category.
   */
  setConfigOptionByCategory(
    category: SessionConfigOptionCategory,
    value: SetSessionConfigOptionRequest["value"],
  ): Promise<SetSessionConfigOptionResponse> {
    if (!this.model) {
      throw new Error("No model initialized. Call initSession() first.");
    }
    return this.model.setConfigOptionByCategory(category, value);
  }

  /**
   * Sets the option advertised with the standard `thought_level` category.
   */
  setThoughtLevel(
    value: SetSessionConfigOptionRequest["value"],
  ): Promise<SetSessionConfigOptionResponse> {
    if (!this.model) {
      throw new Error("No model initialized. Call initSession() first.");
    }
    return this.model.setThoughtLevel(value);
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
