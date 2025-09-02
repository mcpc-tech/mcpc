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
 * # Run the STDIO server directly
 * deno run --allow-all packages/cli/src/bin.ts
 *
 * // Example Claude Desktop configuration
 * {
 *   "mcpServers": {
 *     "mcpc": {
 *       "command": "deno",
 *       "args": ["run", "--allow-all", "packages/cli/src/bin.ts"]
 *     }
 *   }
 * }
 *
 * @module
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./app.ts";

const server = await createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
