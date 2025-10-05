/**
 * MCP Sampling AI SDK Provider
 *
 * This package provides an AI SDK provider implementation that uses MCP (Model Context Protocol)
 * sampling capabilities. It allows you to use MCP servers and their sampling features through
 * the AI SDK's standard provider interface.
 *
 * Benefits:
 * - Reuse AI SDK's agent capabilities with MCP servers
 * - Standardized interface for MCP sampling
 * - Compatible with AI SDK tools and workflows
 *
 * @example
 * ```typescript
 * import { createMCPProvider } from "@mcpc/ai-sdk-provider";
 * import { generateText } from "ai";
 *
 * const provider = createMCPProvider({
 *   serverUrl: "https://api.example.com/mcp",
 *   // or use a local MCP server
 * });
 *
 * const result = await generateText({
 *   model: provider("my-agent"),
 *   prompt: "Hello, world!"
 * });
 * ```
 */

export { createMCPProvider, MCPProvider } from "./src/provider.ts";
export type { MCPProviderConfig, MCPProviderOptions } from "./src/provider.ts";
export { MCPLanguageModel } from "./src/language-model.ts";
