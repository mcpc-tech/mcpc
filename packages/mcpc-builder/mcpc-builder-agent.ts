/**
 * MCPC Builder Agent
 *
 * An agentic MCP server that uses mcpc-builder tools to help discover and compose MCP servers.
 * Uses in-memory transport for zero-overhead communication.
 */

import { type ComposeDefinition, mcpc } from "@mcpc/core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./mod.ts";

const mcpcBuilderServer = createServer();

const deps: ComposeDefinition["deps"] = {
  mcpServers: {
    "mcpc-builder": {
      transportType: "memory",
      server: mcpcBuilderServer,
    },
  },
};

const description = `
Help users discover and compose MCP servers from the mcpc.tech registry.

Available tools:
<tool name="mcpc-builder.search_mcp_servers"/>
<tool name="mcpc-builder.get_env_var_schemas"/>
<tool name="mcpc-builder.compose_mcpc_config"/>

Workflow: search servers → check env vars → compose config → provide install commands.
`;

const server = await mcpc(
  [
    { name: "mcpc-builder-agent", version: "1.0.0" },
    { capabilities: { tools: {}, sampling: {} } },
  ],
  [
    {
      name: "mcpc-builder-agent",
      options: { mode: "agentic", sampling: false },
      description,
      deps,
    },
  ],
);

await server.connect(new StdioServerTransport());
