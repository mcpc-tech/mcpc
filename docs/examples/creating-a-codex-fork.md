# Creating a Codex fork

OpenAI's Codex a is an agent designed to be your software engineering teammate.

This guide will show you how to build your own version using the Agentic MCP
framework. We'll create a "codex fork" agent that composes several tools to
interact with your file system, terminal, and GitHub.

The entire agent can be defined in a single file. This includes defining
dependencies, writing the agent's documentation for the LLM, and starting the
server.

```typescript
import { type ComposeDefinition, mcpc } from "@mcpc/core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// 1. First, Collect Your MCP Server Dependencies
// Define the existing MCP servers that your agent will depend on.
const deps: ComposeDefinition["deps"] = {
  mcpServers: {
    "desktop-commander": {
      command: "npx",
      args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
      transportType: "stdio",
    },
    "lsmcp": {
      command: "npx",
      args: ["-y", "@mizchi/lsmcp", "-p", "tsgo"],
      transportType: "stdio",
    },
    "github": {
      transportType: "streamable-http",
      url: "https://api.githubcopilot.com/mcp/",
      headers: {
        // Use environment variable for GitHub Personal Access Token
        "Authorization": "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}",
      },
    },
  },
};

// 2. Then, Write the Documentation for Your Agent
// This documentation tells the LLM what the agent does, when to use it,
// and how to reference its underlying tools using the <tool> syntax.
const description = `
  You are a "codex fork" agent, a world-class AI assistant for coding tasks.

  Workflow:
  1. Project Overview: Use <tool name="lsmcp.get_project_overview"/> to understand the project structure.
  2. Code Discovery: Locate relevant files using <tool name="lsmcp.search_symbols"/>, <tool name="desktop-commander.start_search"/>, or <tool name="desktop-commander.list_directory"/>.
  3. Implementation: Apply changes with <tool name="desktop-commander.edit_block"/> and verify with <tool name="lsmcp.lsp_get_diagnostics"/>.
  4. Build and Commit: Execute build commands with <tool name="desktop-commander.start_process"/>, then commit changes.
  5. Submission: Create pull requests with <tool name="github.create_pull_request"/>.

  Available tools:
  <tool name="desktop-commander.start_process"/>
  <tool name="desktop-commander.read_file"/>
  <tool name="desktop-commander.write_file"/>
  <tool name="desktop-commander.edit_block"/>
  <tool name="desktop-commander.start_search"/>
  <tool name="desktop-commander.list_directory"/>
  <tool name="lsmcp.get_project_overview"/>
  <tool name="lsmcp.search_symbols"/>
  <tool name="lsmcp.lsp_get_definitions"/>
  <tool name="lsmcp.lsp_get_diagnostics"/>
  <tool name="github.create_pull_request"/>
`;

// 3. Finally, Start the Agentic MCP Server
// The mcpc function initializes the server and manages its tool dependencies.
// We'll run it in "agentic" mode, which uses standard interactive tool calls.
const server = mcpc(
  // Server metadata
  [{
    name: "codex-fork-agent",
    version: "0.1.0",
  }, {
    capabilities: { tools: {} },
  }],
  // Agent definition
  [{
    name: "codex-fork-agent",
    options: {
      mode: "agentic", // or "sampling" for compatible clients
    },
    description,
    deps,
  }],
);

// 4. Connect to a Transport to Make the Agent Accessible
// For simplicity, we connect our server to the MCP stdio transport.
const transport = new StdioServerTransport();
await server.connect(transport);

console.log("✅ Codex Fork agent is running and connected via stdio.");
```
