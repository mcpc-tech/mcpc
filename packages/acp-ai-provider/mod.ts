/**
 * ACP AI SDK Provider
 *
 * This package provides an AI SDK LanguageModelV2 implementation that uses ACP (Agent Client Protocol)
 * agents. It allows you to use ACP-compatible agents through the AI SDK's standard provider interface.
 *
 * @example
 * ```typescript
 * import { createACPProvider } from "@mcpc/acp-client-ai-provider";
 * import { generateText } from "ai";
 *
 * const provider = createACPProvider({
 *   command: "npx",
 *   args: ["-y", "@modelcontextprotocol/server-example"],
 *   cwd: process.cwd(),
 * });
 *
 * const result = await generateText({
 *   model: provider.languageModel(),
 *   prompt: "Hello, world!"
 * });
 * ```
 */

// Main provider API
export { ACPProvider, createACPProvider } from "./src/provider.ts";
export type {} from "./src/provider.ts";

// Types
export type { ACPProviderSettings } from "./src/types.ts";

// Language model
export {
  ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME,
  ACPLanguageModel,
  providerAgentDynamicToolSchema,
} from "./src/language-model.ts";
export type { ProviderAgentDynamicToolInput } from "./src/language-model.ts";

// Re-export useful SDK types for session info
export type {
  ModelInfo,
  NewSessionResponse,
  SessionMode,
  SessionModelState,
  SessionModeState,
} from "@agentclientprotocol/sdk";
