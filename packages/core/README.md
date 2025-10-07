# @mcpc/core

**Build agentic MCP servers by composing existing MCP tools.**

The core SDK for creating agentic Model Context Protocol (MCP) servers. Compose
existing MCP tools into powerful AI agents with simple descriptions and tool
references.

## Installation

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

## Quick Start

```typescript
import { mcpc } from "@mcpc/core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Create an agentic MCP server
const server = await mcpc(
  [
    { name: "my-agent", version: "1.0.0" },
    { capabilities: { tools: {}, sampling: {} } },
  ],
  [{
    name: "my-agent",
    description: `
      I am a coding assistant that can read files and run terminal commands.
      
      Available tools:
      <tool name="desktop-commander.read_file"/>
      <tool name="desktop-commander.execute_command"/>
    `,
    deps: {
      mcpServers: {
        "desktop-commander": {
          command: "npx",
          args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
          transportType: "stdio",
        },
      },
    },
    options: { mode: "agentic" },
  }],
);

// Connect to stdio transport
await server.connect(new StdioServerTransport());
```

## Key Concepts

### Tool References

Reference tools in your agent description using XML-like syntax:

```typescript
description: `
  Available tools:
  <tool name="server.tool"/>              // Basic reference
  <tool name="server.__ALL__"/>           // All tools from server
  <tool name="tool" maxResultLength="2000"/> // Limit result size
  <tool name="tool" hide/>                // Hide from public interface
  <tool name="tool" global/>              // Expose at global scope
`;
```

### MCP Server Dependencies

Support all MCP transport types:

```typescript
deps: {
  mcpServers: {
    "stdio-server": {
      command: "npx",
      args: ["-y", "some-mcp-server"],
      transportType: "stdio"
    },
    "http-server": {
      transportType: "streamable-http",
      url: "https://api.example.com/mcp/",
      headers: { "Authorization": "Bearer ${TOKEN}" }
    },
    "sse-server": {
      transportType: "sse",
      url: "https://api.example.com/sse/"
    }
  }
}
```

### Execution Modes

- **`agentic`** (default): Fully autonomous agent without structured workflow
- **`agentic_workflow`**: Structured workflow with predefined or
  runtime-generated steps

### Plugins

Extend functionality with plugins:

```typescript
import { createLargeResultPlugin } from "@mcpc/core/plugins";

{
  plugins: [
    createLargeResultPlugin({ maxSize: 8000 }),
    "./plugins/custom.ts?param=value",
  ];
}
```

## API Reference

### `mcpc(serverConf, composeConf?, setupCallback?)`

Main entry point for creating agentic MCP servers.

**Parameters:**

- `serverConf` - Server metadata and capabilities
- `composeConf` - Array of agent composition definitions (optional)
- `setupCallback` - Callback for custom setup before composition (optional)

**Returns:** `Promise<ComposableMCPServer>`

See [full documentation](../../docs/README.md) for detailed usage.

## Examples

Find complete examples in the [`examples/`](./examples/) directory:

- `01-basic-composition.ts` - Basic agent composition
- `02-plugin-usage.ts` - Using plugins
- `03-agentic-workflow.ts` - Workflow mode with steps
- `04-sampling-mode.ts` - Autonomous execution with sampling

## Documentation

- [Full Documentation](../../docs/README.md)
- [Plugin System Guide](../../docs/plugins.md)
- [Creating Your First Agentic MCP](../../docs/quickstart/create-your-first-agentic-mcp.md)
- [FAQ](../../docs/faq.md)

## License

MIT
