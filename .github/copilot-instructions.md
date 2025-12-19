# MCPC Development Guide

MCPC lets you build agentic MCP servers by composing existing MCP tools. Think
of it as creating AI agents from reusable tool libraries, the agent itself is a
MCP tool too.

## Rules

NEVER use deno specific APIs in code, use node compatible APIs only.

## Core Pattern

Every MCPC server follows the same simple pattern:

```typescript
const server = await mcpc(
  [{ name: "my-agent", version: "1.0.0" }, {
    capabilities: { tools: {} },
  }],
  [{
    name: "my-agent",
    description: "Agent docs with <tool name='server.tool'/> references",
    deps: { mcpServers: {/* MCP server configs */} },
    options: { mode: "agentic" },
  }],
);
await server.connect(new StdioServerTransport());
```

That's it. Three parts: server metadata, agent definition(s), transport
connection.

## Tool Selection with XML Tags

Reference tools in your agent description using XML-like syntax:

```typescript
description: `
Available tools:
<tool name="desktop-commander.read_file"/>
<tool name="github.__ALL__"/>  // All tools from github server
<tool name="tool1" maxResultLength="2000"/>  // Limit result size
<tool name="sensitive" hide/>  // Hide from public interface
`;
```

Tool names are always `servername.toolname`. The framework auto-maps both
`server.tool` and `server_tool` formats.

## MCP Server Dependencies

Support all transport types: stdio, streamable-http, sse.

```typescript
deps: {
  mcpServers: {
    "desktop-commander": {
      command: "npx",
      args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
      transportType: "stdio"
    },
    "github": {
      transportType: "streamable-http",
      url: "https://api.githubcopilot.com/mcp/",
      headers: { "Authorization": "Bearer ${GITHUB_TOKEN}" }  // Env vars work
    }
  }
}
```

## Execution Modes

- **`mode: "agentic"`** (default): Interactive tool calls, agent decides next
  step
- **`mode: "agentic_workflow"`**: Structured steps (predefined or generated at
  runtime)
- **`sampling: true`**: Autonomous execution in compatible clients (VS Code,
  etc.)

Sampling requires `capabilities.sampling: {}` in client.

## Plugin System

Load plugins globally or inline:

```typescript
{
  plugins: [
    "./plugins/large-result.ts?maxSize=8000", // File path with query params
    { name: "inline-plugin", transformTool: (tool) => {/* modify tool */} },
  ];
}
```

Plugins follow lifecycle: `configureServer` → `composeStart` → `transformTool` →
`finalizeComposition` → `composeEnd`.

See `packages/core/src/plugin-types.ts` for full plugin interface.

## Project Structure

- `packages/core/` - Main framework (`mod.ts` is entry point)
- `packages/cli/` - HTTP server wrapper with config file support
- `packages/core/src/compose.ts` - `ComposableMCPServer` class, core composition
- `packages/core/src/executors/` - Three mode implementations
- `packages/core/examples/` - Working examples (best learning resource)

## Development Workflow

```bash
# Enable git hooks for auto-formatting/linting
git config core.hooksPath .githooks

# Run precommit checks manually
deno task precommit  # Runs: lint, check, fmt

# Run examples (great for testing)
deno run --allow-all packages/core/examples/01-basic-composition.ts

# Test
deno test --allow-env --allow-read packages/core/tests/

# Install dependencies (workspace uses Deno with npm compatibility)
deno install
```

## CLI Usage

The CLI wraps core with HTTP/SSE support and config files:

```bash
# From inline JSON
deno run --allow-all packages/cli/src/bin.ts --config '{"name":"agent",...}'

# From URL
deno run --allow-all packages/cli/src/bin.ts --config-url https://example.com/config.json

# From file (or defaults to ./mcpc.config.json)
deno run --allow-all packages/cli/src/bin.ts --config-file ./codex-fork.json
```

Config structure matches `ComposeDefinition` - see
`packages/cli/examples/configs/` for examples.

## Common Patterns

**Internal tools** (hidden from LLM, accessible via `callTool()`):

```typescript
server.tool("internal-audit", "...", schema, callback, { internal: true });
```

**Large result handling**: Results >8KB auto-truncate with `grep-search` tool
suggestion. Original stored in `toolResultStorage` singleton.

**Environment variables in configs**: Use `${VAR_NAME}` syntax in JSON strings -
parsed at runtime.

## Design Philosophy

KISS principle throughout:

- Declarative over imperative
- Single-purpose agents with explicit tool selection
- Simple `mcpc()` API, not complex builders
- Examples over extensive documentation

## Quick Troubleshooting

- Tool not found? Use full name: `server.tool` (not just `tool`)
- `__ALL__` includes every tool from a server - use sparingly
- Config not loading? CLI checks: `--config` → `--config-url` → `--config-file`
  → `./mcpc.config.json`
