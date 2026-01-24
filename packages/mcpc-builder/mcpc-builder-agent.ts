/**
 * MCPC Builder Agent
 *
 * An agentic MCP server that uses mcpc-builder tools to help discover and compose MCP servers.
 * Uses in-memory transport for zero-overhead communication.
 * Agent definition loaded from markdown file with deps override for memory transport.
 */

import { mcpc } from "@mcpc/core";
import { loadMarkdownAgentFile } from "@mcpc/plugin-markdown-loader";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import process from "node:process";
import { createServer } from "./mod.ts";

function resolveAgentMdPath(): string {
  // Local dev: ./agents/mcpc-builder-agent.md (relative to this file)
  // Bundled npm: ../agents/mcpc-builder-agent.md (bin/mcpc-builder-agent.mjs -> agents/)
  const localPath = fileURLToPath(
    new URL("./agents/mcpc-builder-agent.md", import.meta.url),
  );
  if (existsSync(localPath)) return localPath;

  return fileURLToPath(
    new URL("../agents/mcpc-builder-agent.md", import.meta.url),
  );
}

async function main() {
  const agentDef = await loadMarkdownAgentFile(resolveAgentMdPath());

  // Override deps with in-memory server (can't be defined in markdown)
  agentDef.deps = {
    mcpServers: {
      "mcpc-builder": {
        transportType: "memory",
        server: createServer(),
      },
    },
  };

  const server = await mcpc(
    [
      { name: "mcpc-builder-agent", version: "1.0.0" },
      { capabilities: { tools: {} } },
    ],
    [agentDef],
  );

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error("Failed to start mcpc-builder-agent:", err);
  process.exit(1);
});
