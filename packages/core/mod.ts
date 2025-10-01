/** MCPC Core - Build agentic MCP servers by composing existing MCP tools.
 *
 * Create powerful AI agents by combining tools from the MCP ecosystem.
 * Write a simple description, select your tools, and get a working MCP server.
 *
 * ```ts
 * import { type ComposeDefinition, mcpc } from "@mcpc/core";
 * import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
 *
 * // Define MCP server dependencies
 * const deps: ComposeDefinition['deps'] = {
 *   mcpServers: {
 *     "desktop-commander": {
 *       command: "npx",
 *       args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
 *       transportType: "stdio",
 *     }
 *   }
 * }
 *
 * // Write agent description with tool references
 * const description = `
 * I am a coding assistant that can read files and run terminal commands.
 *
 * Available tools:
 * <tool name="desktop-commander.exec" />
 * <tool name="desktop-commander.readFile" />
 * <tool name="desktop-commander.writeFile" />
 * `
 *
 * // Create and start the server
 * const server = await mcpc(
 *   [{ name: "coding-agent", version: "1.0.0" }],
 *   [{ name: 'coding-agent', description, deps }]
 * )
 *
 * const transport = new StdioServerTransport()
 * await server.connect(transport)
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

export * from "./src/utils/common/env.ts";
export * from "./src/utils/common/json.ts";
export * from "./src/utils/common/mcp.ts";

export * from "./src/set-up-mcp-compose.ts";
