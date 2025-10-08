# MCPC

**Build agentic MCP servers by composing existing MCP tools.**

MCPC is the SDK for building agentic MCP (Model Context Protocol) Servers. You
can use it to:

1. **Create Powerful Agentic MCP Tools:** Simply describe your vision in text
   and reference tools from the
   [expanding MCP community](https://registry.modelcontextprotocol.io/docs#/operations/list-servers).
   As standard MCP tools, your agents work everywhere and collaborate
   seamlessly.
2. **Fine-Tune Existing Tools:** Flexibly modify existing tool descriptions and
   parameters, or wrap and filter results to precisely adapt them to your
   specific business scenarios.
3. **Build Multi-Agent Systems:** By defining each agent as a MCP tool, you can
   compose and orchestrate them to construct sophisticated, collaborative
   multi-agent systems.

## Key Features

- **Portability and agent interoperability**: Build once, run everywhere as MCP
  tools - agents work across all MCP clients and can discover and collaborate
  with each other through standard MCP interfaces
- **Simple composition and fine-tuning**: Compose MCP servers as building
  blocks, select and customize tools, or modify their descriptions and
  parameters
- **Two agentic tool modes**: Interactive (agentic) or autonomous (sampling)
- **Logging and tracing**: Built-in MCP logging and OpenTelemetry tracing
  support

## Quick Start

### Installation

```bash
# npm (from npm registry)
npm install @mcpc-tech/core
# npm (from jsr)
npx jsr add @mcpc/core

# deno
deno add jsr:@mcpc/core

# pnpm (from npm registry)
pnpm add @mcpc-tech/core
# pnpm (from jsr)
pnpm add jsr:@mcpc/core
```

Or run directly with the CLI (no installation required):

```bash
# Run with remote configuration
npx -y @mcpc-tech/cli --config-url \
  "https://raw.githubusercontent.com/mcpc-tech/mcpc/main/packages/cli/examples/configs/codex-fork.json"
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
    lsmcp: {
      command: "npx",
      args: ["-y", "@mizchi/lsmcp", "-p", "tsgo"],
      transportType: "stdio",
    },
    github: {
      transportType: "streamable-http",
      url: "https://api.githubcopilot.com/mcp/",
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_PERSONAL_ACCESS_TOKEN}`,
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
- To execute a shell command: <tool name="desktop-commander.execute_command" />
- To read a file's content: <tool name="desktop-commander.read_file" />
- To write content to a file: <tool name="desktop-commander.write_file" />
- To find symbol definitions: <tool name="lsmcp.definition" />
- To create a GitHub pull request: <tool name="github.create_pull_request" />
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

### Quick Start with CLI

For a faster way to get started, use the CLI to load configuration from a remote
URL:

```bash
# Set your GitHub token
export GITHUB_PERSONAL_ACCESS_TOKEN="ghp_your_token_here"

# Load configuration from URL
npx -y deno run -A jsr:@mcpc/cli/bin --config-url \
  "https://raw.githubusercontent.com/mcpc-tech/mcpc/main/packages/cli/examples/configs/codex-fork.json"
```

See [CLI Usage Guide](docs/quickstart/cli-usage.md) for more configuration
options.

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
- **[CLI Usage Guide](docs/quickstart/cli-usage.md)** - Using the MCPC CLI
- **[Logging and Tracing](docs/logging-and-tracing.md)** - MCP logging and
  OpenTelemetry tracing
- **[Examples](docs/examples/)** - Real-world use cases
- **[FAQ](docs/faq.md)** - Common questions and answer

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
