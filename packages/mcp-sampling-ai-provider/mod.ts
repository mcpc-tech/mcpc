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
 *   model: provider.languageModel("copilot/gpt-4"),
 *   prompt: "Hello, world!"
 * });
 * ```
 */

export {
  createMCPSamplingProvider,
  createMCPSamplingProvider as createSamplingProvider,
  MCPSamplingProvider as MCPProvider,
} from "./src/provider.ts";
export type {
  MCPSamplingProviderConfig as MCPProviderConfig,
  MCPSamplingProviderOptions as MCPProviderOptions,
} from "./src/provider.ts";
export { MCPSamplingLanguageModel as MCPLanguageModel } from "./src/language-model.ts";
export type { MCPSamplingLanguageModelConfig as MCPLanguageModelConfig } from "./src/language-model.ts";
