# MCPC

[![JSR](https://jsr.io/badges/@mcpc/core)](https://jsr.io/@mcpc/core)
[![npm](https://img.shields.io/npm/v/@mcpc-tech/core)](https://www.npmjs.com/package/@mcpc-tech/core)

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
- **Logging and tracing**: Built-in MCP logging and OpenTelemetry tracing
  support
- **Skills support**: Define domain-specific knowledge following the
  [Agent Skills specification](https://agentskills.io) - deploy to production,
  share via MCP, and declare tool dependencies
- **Flexible execution modes**: Multiple specialized modes to fit different
  scenarios - interactive agent (`agentic`), structured workflow
  (`agentic_workflow`), workflow sampling (`agentic_workflow_sampling`), AI SDK
  sampling (`ai_sampling`), and secure code execution
  ([`code_execution`](packages/plugin-code-execution/)) - each with dedicated
  implementations

## Quick Start

### Three Ways to Get Started

#### 1. Use the Website (Fastest)

Visit **[mcpc.tech](https://mcpc.tech)** to browse servers from the official MCP
registry, discover tools, and generate ready-to-use agents.

#### 2. Use the Agent (Interactive)

Let AI help you discover servers and build agents:

**Add to your MCP client:**

```json
{
  "mcpServers": {
    "mcpc-builder-agent": {
      "command": "npx",
      "args": ["-y", "@mcpc-tech/builder", "mcpc-builder-agent"]
    }
  }
}
```

#### 3. Write Code (Full Control)

Use the SDK directly for complete customization. See examples below.

---

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

```typescript
import { mcpc } from "@mcpc/core";

const server = await mcpc(
  [{ name: "coding-agent", version: "0.1.0" }, { capabilities: { tools: {} } }],
  [{
    name: "coding-agent",
    description: `
      You are a coding assistant with advanced capabilities.

      Your capabilities include:
      - Reading and writing files
      - Executing terminal commands to build, test, and run projects
      - Interacting with GitHub to create pull requests and manage issues

      Available tools:
      <tool name="desktop-commander.execute_command" />
      <tool name="desktop-commander.read_file" />
      <tool name="desktop-commander.write_file" />
      <tool name="github.create_pull_request" />
    `,
    deps: {
      mcpServers: {
        "desktop-commander": {
          command: "npx",
          args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
          transportType: "stdio",
        },
        github: {
          transportType: "streamable-http",
          url: "https://api.githubcopilot.com/mcp/",
        },
      },
    },
  }],
);
```

> **Complete Example**: See the full
> [Codex fork tutorial](docs/examples/creating-a-codex-fork.md).

### Examples: Load Agent Skills

For complex agents where inline `description` becomes unwieldy, use
[Agent Skills](https://agentskills.io) to organize domain knowledge in separate
files that are loaded on-demand.

```typescript
import { createSkillsPlugin } from "@mcpc/core/plugins/skills";

const server = await mcpc(
  [{ name: "my-agent", version: "1.0.0" }, { capabilities: { tools: {} } }],
  [{
    name: "my-agent",
    description: "An agent with domain knowledge",
    plugins: [createSkillsPlugin({ paths: ["./skills"] })],
  }],
);
```

> **Complete Example**: See
> [14-skills-plugin.ts](packages/core/examples/14-skills-plugin.ts).

## How It Works

Three simple steps:

1. **Define dependencies** - List the MCP servers you want to use
2. **Write agent description** - Describe what your agent does and reference
   tools
3. **Create server** - Use `mcpc()` to build and connect your server

## Execution Modes

MCPC provides multiple flexible execution modes to fit different scenarios:

| Mode                        | Description                                       | Use Case                      |
| --------------------------- | ------------------------------------------------- | ----------------------------- |
| `agentic`                   | Interactive step-by-step execution                | Standard agent interactions   |
| `agentic_workflow`          | Structured workflow with predefined/dynamic steps | Multi-step processes          |
| `agentic_workflow_sampling` | Autonomous workflow execution                     | Complex autonomous workflows  |
| `ai_sampling`               | AI SDK sampling mode                              | Autonomous AI SDK execution   |
| `code_execution`            | Secure JavaScript sandbox with tool access        | Code generation and execution |

### Quick Example

```typescript
// Interactive agent (default)
{ options: { mode: "agentic" } }

// Autonomous agent
{ options: { mode: "ai_sampling", samplingConfig: { maxIterations: 10 } } }

// Code execution with sandbox
import { createCodeExecutionPlugin } from "@mcpc/plugin-code-execution/plugin";
{
  plugins: [createCodeExecutionPlugin()],
  options: { mode: "code_execution" }
}
```

> **Detailed Documentation**: See
> [Execution Modes Guide](docs/execution-modes.md) for comprehensive information
> on each mode, configuration options, and best practices.

## Documentation

- **[Getting Started](docs/quickstart/installation.md)** - Installation and
  first steps
- **[Creating Your First Agent](docs/quickstart/create-your-first-agentic-mcp.md)** -
  Complete tutorial
- **[Execution Modes](docs/execution-modes.md)** - Comprehensive guide to all
  execution modes
- **[CLI Usage Guide](docs/quickstart/cli-usage.md)** - Using the MCPC CLI
- **[Logging and Tracing](docs/logging-and-tracing.md)** - MCP logging and
  OpenTelemetry tracing
- **[Examples](docs/examples/)** - Real-world use cases
- **[FAQ](docs/faq.md)** - Common questions and answer

## Examples

See working examples in the [examples directory](packages/core/examples/) or
check out the [Codex fork tutorial](docs/examples/creating-a-codex-fork.md).

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) for details.
