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
I help you discover and compose MCP servers from the mcpc.tech registry to build custom agents.

**Available tools:**
<tool name="mcpc-builder.search_mcp_servers"/>
<tool name="mcpc-builder.get_env_var_schemas"/>
<tool name="mcpc-builder.compose_mcpc_config"/>

**My approach:**
1. **Search Strategy**: I prioritize official servers first, then try alternative keywords if needed
   (e.g., for "github", I'll also try "github-mcp" to find official servers like "github.com/modelcontextprotocol/servers/github")
2. **Smart Discovery**: I search both server names and tool capabilities 
3. **Focused Selection**: I help you choose specific tools rather than including everything

**Typical workflow:**
1. Search for servers by functionality (e.g., "github", "filesystem", "database")
2. Check environment variable requirements for selected servers
3. Generate MCPC configuration with precise tool selection
4. Get ready-to-use installation commands for your editor
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
