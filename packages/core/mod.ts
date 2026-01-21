/** MCPC Core - Build agentic MCP servers by composing existing MCP tools.
 *
 * Create powerful AI agents by combining tools from the MCP ecosystem.
 * Write a simple description, select your tools, and get a working MCP server.
 *
 * ```ts
 * import { mcpc } from "@mcpc/core";
 * import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
 *
 * const server = await mcpc({
 *   name: "coding-agent",
 *   version: "1.0.0",
 *
 *   agents: [{
 *     name: "coding-agent",
 *     description: `
 *       I am a coding assistant that can read files and run terminal commands.
 *       <tool name="desktop-commander.execute_command"/>
 *       <tool name="desktop-commander.read_file"/>
 *     `,
 *     mcpServers: {
 *       "desktop-commander": {
 *         command: "npx",
 *         args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
 *       },
 *     },
 *   }],
 * });
 *
 * await server.connect(new StdioServerTransport());
 * ```
 *
 * ## Documentation
 *
 * - [Getting Started](https://github.com/mcpc-tech/mcpc/tree/main/docs/quickstart/installation.md)
 * - [Complete Tutorial](https://github.com/mcpc-tech/mcpc/tree/main/docs/quickstart/create-your-first-agentic-mcp.md)
 * - [Examples](https://github.com/mcpc-tech/mcpc/tree/main/docs/examples/)
 * - [FAQ](https://github.com/mcpc-tech/mcpc/tree/main/docs/faq.md)
 *
 * @module
 */

export * from "./src/compose.ts";

// Service types
export type {
  McpServerConfig,
  MCPSetting,
  SseServerConfig,
  StdioServerConfig,
  StreamableHTTPServerConfig,
} from "./src/service/tools.ts";

// Core types
export type { SamplingConfig, ToolRefXml } from "./src/types.ts";

// Plugin system
export type {
  AfterToolExecuteContext,
  AfterToolExecuteResult,
  AgentToolRegistrationContext,
  BeforeToolExecuteContext,
  BeforeToolExecuteResult,
  ComposedTool,
  ComposeEndContext,
  ComposeStartContext,
  FinalizeContext,
  RuntimeTransformContext,
  ToolConfig,
  ToolPlugin,
  TransformContext,
} from "./src/plugin-types.ts";

export * from "./src/utils/common/env.ts";
export * from "./src/utils/common/json.ts";
export * from "./src/utils/common/mcp.ts";

// Legacy API - Positional arguments pattern (deprecated)
export {
  type ComposeDefinition,
  type ComposeInput,
  type ComposibleMCPConfig,
  isMarkdownFile,
  type MarkdownAgentLoader,
  mcpc as mcpcLegacy,
  type McpcOptions,
  parseMcpcConfigs,
  setMarkdownAgentLoader,
} from "./src/set-up-mcp-compose.ts";

// Main API - Single configuration object pattern
export {
  type AgentDef,
  type AgentOptions,
  mcpc,
  type McpcConfig,
  type McpServerDef,
  registerMarkdownLoader,
  type ServerCapabilities,
} from "./src/mcpc.ts";

// Schema utilities (replaces AI SDK dependency)
export {
  extractJsonSchema,
  isWrappedSchema,
  jsonSchema,
  type Schema,
} from "./src/utils/schema.ts";

// AI SDK Integration
export {
  convertToAISDKTools,
  type JsonSchemaHelper,
  type ToolHelper,
} from "./src/ai-sdk-adapter.ts";
