#!/usr/bin/env -S deno run --allow-all
/**
 * Binary entry point for MCPC Builder server
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import process from "node:process";
import { createServer } from "./src/server.ts";

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCPC Builder MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
