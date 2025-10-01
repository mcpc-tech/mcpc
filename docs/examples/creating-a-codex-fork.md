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
        // Note: You would typically use a secrets manager for API keys.
        "Authorization": "Bearer ${input:github_mcp_pat}",
      },
    },
  },
};

// 2. Then, Write the Documentation for Your Agent
// This documentation tells the LLM what the agent does, when to use it,
// and how to reference its underlying tools using the <tool> syntax.
const description = `
  You are a "codex fork" agent, a world-class AI assistant for coding tasks.

  Your capabilities include:
  - Reading and writing files.
  - Searching the codebase using advanced language server features.
  - Executing terminal commands to build, test, and run projects.
  - Interacting with GitHub to create pull requests and manage issues.

  To perform these actions, you must use the following tools:
  - To execute a shell command: <tool name="desktop-commander.exec" />
  - To read a file's content: <tool name="desktop-commander.readFile" />
  - To write content to a file: <tool name="desktop-commander.writeFile" />
  - To find symbol definitions: <tool name="lsmcp.definition" />
  - To create a GitHub pull request: <tool name="github.createPullRequest" />
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
    capabilities: { tools: {}, sampling: {} },
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
