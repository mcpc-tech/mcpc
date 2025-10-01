# MCPC

**Build agentic MCP servers by composing existing MCP tools.**

MCPC lets you create powerful AI agents by combining tools from the MCP
ecosystem. Write a simple description, select your tools, and get a working MCP
server.

## What You Can Build

- **Coding agents** that read files, run commands, and interact with GitHub
- **Web automation** that controls browsers and processes data
- **Multi-agent systems** where agents work together on complex tasks

## Key Features

- **Simple composition**: Reuse existing MCP servers as building blocks
- **Two execution modes**: Interactive (agentic) or autonomous (sampling)
- **All transport types**: stdio, HTTP, and server-sent events
- **Tool selection**: Pick specific tools or use everything from an MCP server

## Quick Start

### Installation

```bash
# npm
npx jsr add @mcpc/core
# deno  
deno add jsr:@mcpc/core
# pnpm
pnpm add jsr:@mcpc/core
```

### Examples: Create a Simple Codex/Claude Code Fork

Build your own Codex or Claude Code fork in minutes:

```typescript
import { type ComposeDefinition, mcpc } from "@mcpc/core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// 1. Define MCP server dependencies
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
        "Authorization": "Bearer ${input:github_mcp_pat}",
      },
    },
  },
};

// 2. Write agent description with tool references
const description = `
You are a coding assistant with advanced capabilities.

Your capabilities include:
- Reading and writing files
- Searching the codebase using language server features  
- Executing terminal commands to build, test, and run projects
- Interacting with GitHub to create pull requests and manage issues

To perform these actions, you must use the following tools:
- To execute a shell command: <tool name="desktop-commander.exec" />
- To read a file's content: <tool name="desktop-commander.readFile" />
- To write content to a file: <tool name="desktop-commander.writeFile" />
- To find symbol definitions: <tool name="lsmcp.definition" />
- To create a GitHub pull request: <tool name="github.createPullRequest" />
`;

// 3. Create and start the server
const server = await mcpc(
  [
    {
      name: "coding-agent",
      version: "0.1.0",
    },
    { capabilities: { tools: {}, sampling: {} } },
  ],
  [
    {
      name: "coding-agent",
      options: {
        mode: "agentic",
      },
      description,
      deps,
    },
  ],
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

> 💡 **Complete Example**: See the full
> [Codex fork tutorial](docs/examples/creating-a-codex-fork.md) for a
> step-by-step walkthrough.

## How It Works

Three simple steps:

1. **Define dependencies** - List the MCP servers you want to use
2. **Write agent description** - Describe what your agent does and reference
   tools
3. **Create server** - Use `mcpc()` to build and connect your server

## Execution Modes

**Agentic Mode** (default) - Interactive tool calls step by step

```typescript
{
  mode: "agentic";
} // LLM calls tools interactively
```

**Sampling Mode** - Autonomous execution in compatible clients

```typescript
{ options: { mode: "agentic", sampling: true } }  // Runs autonomously in VS Code
```

## Documentation

- **[Getting Started](docs/quickstart/installation.md)** - Installation and
  first steps
- **[Creating Your First Agent](docs/quickstart/create-your-first-agentic-mcp.md)** -
  Complete tutorial
- **[Examples](docs/examples/)** - Real-world use cases
- **[FAQ](docs/faq.md)** - Common questions and answers

## Use Cases

- **Coding Assistant** - File management, terminal commands, GitHub integration
- **Web Automation** - Browser control, data extraction, form filling
- **DevOps Helper** - Build pipelines, deployment, monitoring
- **Data Processor** - ETL workflows, analysis, reporting

## Using with AI Clients

Add your server to Claude Desktop, VS Code, or any MCP-compatible client:

```json
{
  "mcpServers": {
    "my-agent": {
      "command": "npx",
      "args": ["tsx", "my-server.ts"]
    }
  }
}
```

## Examples

See working examples in the [examples directory](packages/core/examples/) or
check out the [Codex fork tutorial](docs/examples/creating-a-codex-fork.md).

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) for details.
