/** MCPC CLI STDIO Server - Standard input/output transport for MCP protocol.
 *
 * This module provides a STDIO-based server transport for the Model Context Protocol (MCP).
 * It enables communication between MCP clients (like Claude Desktop) and the MCPC server
 * through standard input and output streams.
 *
 * This is the primary entry point for running MCPC as an MCP server that can be
 * integrated with MCP clients via STDIO transport, which is the most common
 * communication method for MCP servers.
 *
 * Configuration:
 * - MCPC_CONFIG: JSON string with agent configuration
 * - MCPC_CONFIG_FILE: Path to JSON config file
 * - Default: ./mcpc.config.json
 *
 * # Run the STDIO server directly
 * deno run --allow-all packages/cli/src/bin.ts
 *
 * # With environment variable configuration
 * MCPC_CONFIG='[{"name":"my-agent","description":"...","deps":{...}}]' deno run --allow-all packages/cli/src/bin.ts
 *
 * // Example Claude Desktop configuration
 * {
 *   "mcpServers": {
 *     "mcpc": {
 *       "command": "deno",
 *       "args": ["run", "--allow-all", "packages/cli/src/bin.ts"],
 *       "env": {
 *         "MCPC_CONFIG": "[{\"name\":\"my-agent\",\"description\":\"...\",\"deps\":{...}}]"
 *       }
 *     }
 *   }
 * }
 *
 * @module
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./app.ts";
import { loadConfig } from "./config/loader.ts";
import { createCodeExecutionPlugin } from "@mcpc-tech/plugin-code-execution";

// Load configuration from environment or file
const config = await loadConfig();

// Add plugins
config?.agents.forEach((agent) => {
  if (agent.plugins?.length ?? 0 === 0) {
    agent.plugins = [];
  }
  agent.plugins?.push(createCodeExecutionPlugin());
});

if (config) {
  console.error(`Loaded configuration with ${config.agents.length} agent(s)`);
} else {
  console.error("No configuration found, using default example configuration");
}

const server = await createServer(config || undefined);
const transport = new StdioServerTransport();
await server.connect(transport);
