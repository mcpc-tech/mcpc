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
1. **Search Strategy**: ALWAYS append "-mcp" suffix to search queries to find MCP servers
   - User asks for "github" → search "github-mcp"
   - When multiple results are found, prioritize the most official server (e.g., "github.com/modelcontextprotocol/servers/github" over third-party alternatives)
2. **Multi-Server Composition**: I can combine multiple MCP servers to handle complex tasks
   - Example: Use "github-mcp" + "desktop-commander" for code repository analysis
   - Example: Combine "slack-mcp" + "google-drive-mcp" for workflow automation
   - I intelligently select relevant tools from each server to create focused agents
3. **Smart Discovery**: I search both server names and tool capabilities 
4. **Focused Selection**: I help you choose specific tools rather than including everything

**Typical workflow:**
1. Search for servers by functionality - REMEMBER to add "-mcp" suffix (e.g., "github-mcp", "filesystem-mcp", "database-mcp")
2. For complex tasks, identify and search for multiple complementary servers
3. Check environment variable requirements for all selected servers
4. Generate MCPC configuration with precise tool selection from each server
5. Get ready-to-use installation commands for your editor
`;

(async () => {
  const server = await mcpc(
    [
      { name: "mcpc-builder-agent", version: "1.0.0" },
      { capabilities: { tools: {} } },
    ],
    [
      {
        name: "mcpc-builder-agent",
        options: { mode: "agentic" },
        description,
        deps,
      },
    ],
  );

  await server.connect(new StdioServerTransport());
})();
