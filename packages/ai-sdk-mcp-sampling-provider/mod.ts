/**
 * MCP Sampling AI SDK Provider
 *
 * This package provides an AI SDK LanguageModelV2 implementation that uses MCP (Model Context Protocol)
 * server's createMessage capability. It allows you to use MCP servers with sampling through
 * the AI SDK's standard provider interface.
 *
 * Benefits:
 * - Use MCP servers directly with AI SDK
 * - LanguageModelV2 specification support
 * - Compatible with AI SDK tools and workflows
 *
 * @example
 * ```typescript
 * import { createMCPSamplingProvider } from "@mcpc/ai-sdk-mcp-sampling-provider";
 * import { generateText } from "ai";
 * import { mcpc } from "@mcpc/core";
 *
 * const server = await mcpc(
 *   [{ name: "my-agent", version: "1.0.0" }, { capabilities: { sampling: {} } }],
 *   [{ name: "my-agent", description: "...", options: { sampling: true } }]
 * );
 *
 * const provider = createMCPSamplingProvider({ server });
 *
 * const result = await generateText({
 *   model: provider.languageModel("my-agent"),
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
