/**
 * MCP Sampling AI SDK Provider
 *
 * This package provides an AI SDK LanguageModelV2 implementation that uses MCP (Model Context Protocol)
 * server's createMessage capability. It allows you to use MCP servers with sampling through
 * the AI SDK's standard provider interface.
 *
 * @example
 * ```typescript
 * import { createMCPSamplingProvider } from "@mcpc/mcp-sampling-ai-provider";
 * import { generateText } from "ai";
 * import { Server } from "@modelcontextprotocol/sdk/server/index.js";
 *
 * const server = new Server(
 *   { name: "my-agent", version: "1.0.0" },
 *   { capabilities: { sampling: {}, tools: {} } }
 * );
 *
 * const provider = createMCPSamplingProvider({ server });
 *
 * const result = await generateText({
 *   model: provider.languageModel({
 *     modelPreferences: { hints: [{ name: "copilot/gpt-4o" }] }
 *   }),
 *   prompt: "Hello, world!"
 * });
 * ```
 */

// Main provider API
export {
  createMCPSamplingProvider,
  MCPSamplingProvider,
} from "./src/provider.ts";
export type {
  MCPSamplingProviderConfig,
  MCPSamplingProviderOptions,
} from "./src/provider.ts";

// Custom sampling handler for clients without native support
export {
  createClientSampling,
  selectModelFromPreferences,
  setupClientSampling,
} from "./src/client-sampling.ts";
export type {
  AISDKHandler,
  ClientSamplingConfig,
} from "./src/client-sampling.ts";

// Utilities
export { convertAISDKFinishReasonToMCP } from "./src/utils.ts";
