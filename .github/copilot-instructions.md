# MCPC Development Guide

MCPC is a framework for building scalable agentic MCP (Model Context Protocol)
servers that can compose multiple dependent MCP servers into unified workflows.

## Architecture Overview

**Core Pattern**: MCPC servers are created through `mcpc()` function with two
key parts:

1. **Server metadata** - name, version, capabilities
2. **Agent definitions** - description, dependencies, execution mode

```typescript
const server = await mcpc(
  [{ name: "my-agent", version: "1.0.0" }],  // Server metadata
  [{ name: "agent", description: "...", deps: {...} }]  // Agent definitions
);
```

**Key Components**:

- `packages/core/src/compose.ts` - Core composition logic and
  `ComposableMCPServer` class
- `packages/core/src/executors/` - Three execution modes (agentic, workflow,
  sampling)
- `packages/core/src/tools/` - Built-in tools including grep-search for result
  management
- `packages/core/src/utils/tool-result-storage.ts` - Storage system for
  truncated tool results

## Execution Modes

**Agentic Mode** (`mode: "agentic"`): Fully autonomous agents with complete
decision-making freedom **Workflow Mode** (`mode: "agentic_workflow"`):
Structured step-by-step execution with predefined or dynamic steps **Sampling
Mode** (`sampling: true`): Autonomous execution with iterative tool invocation
patterns

## Tool Management Patterns

**Tool Selection with XML Tags**:

```typescript
description: `
Available tools:
<tool name="server.specific_tool"/>
<tool name="server.__ALL__"/>  // Include all tools from server
<tool name="tool1" description="Custom description"/>
<tool name="sensitive_tool" hide/>  // Hide from public interface
<tool name="large_output_tool" maxResultLength="2000"/>
`;
```

**Tool Override System**: Use `toolOverrides` map in `ComposableMCPServer` for:

- Custom descriptions
- Result length limits
- Hiding sensitive operations
- Custom argument processing

## Dependencies & Composition

**MCP Server Dependencies**:

```typescript
deps: {
  mcpServers: {
    "@wonderwhy-er/desktop-commander": {
      command: "npx",
      args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
      transportType: "stdio"
    }
  }
}
```

**Tool Namespacing**: Tools are automatically namespaced as
`servername.toolname` with mapping support for both dot and underscore notation.

## Result Management

**Automatic Truncation**: Large tool results are truncated with built-in
`grep-search` tool suggestions **Storage System**: `toolResultStorage` singleton
stores original results for later searching **Search Integration**: Users get
truncated content + regex search capabilities for full results

## Key File Patterns

**Examples**: `packages/core/examples/` - All examples follow `mcpc()` →
`connect()` pattern **Executors**: Each mode has separate executor class in
`src/executors/{agentic,workflow,sampling}/` **Factories**: `src/factories/`
contain schema and argument definition factories **Transport**: Use
`StdioServerTransport` for standard MCP client integration

## Development Commands

```bash
# Run examples
deno run --allow-all packages/core/examples/01-basic-composition.ts

# Test
deno test --allow-env --allow-read packages/core/tests/

# Workspace uses Deno with npm compatibility
deno install  # Install dependencies
```

## Internal Tools

Register internal tools (audit, logging) using:

```typescript
server.tool("internal-name", "description", schema, callback, true); // true = internal
```

Internal tools are accessible via `callTool()` but hidden from public MCP
interface.

## Design Principles

**KISS Principle**: Keep implementations simple and focused. MCPC favors:

- Declarative configuration over complex imperative code
- Single-purpose agents with clear tool selections
- Simple `mcpc()` API over verbose builder patterns
- Direct tool composition rather than complex orchestration layers

## Common Pitfalls

- Always use absolute tool names with server prefixes when referencing tools
- `__ALL__` placeholder includes all tools from a server - use sparingly
- Tool name resolution supports both `server.tool` and `server_tool` formats
- Result length limits are per-tool, not global - set via `maxResultLength` in
  tool tags
- Sampling mode requires `capabilities.sampling: {}` in server metadata
