# @mcpc/plugin-code-execution

[![JSR](https://jsr.io/badges/@mcpc/plugin-code-execution)](https://jsr.io/@mcpc/plugin-code-execution)
[![npm](https://img.shields.io/npm/v/@mcpc-tech/plugin-code-execution)](https://www.npmjs.com/package/@mcpc-tech/plugin-code-execution)

Secure JavaScript code execution sandbox using Deno for MCPC agents. This
package provides a safe environment to execute user-provided JavaScript code
with MCP tool access via JSON-RPC IPC.

## Features

- 🔒 **Secure Sandboxing**: Uses Deno's permission system for isolated code
  execution
- 🔌 **JSON-RPC IPC**: Tool calls are transmitted via JSON-RPC between sandbox
  and host
- 🚀 **Easy Integration**: Plugin-based integration with MCPC
- 📦 **Zero Config**: Automatically locates Deno binary from npm package
- 🛡️ **Resource Limits**: Configurable timeouts and memory limits

## Installation

```bash
# npm
npm install @mcpc-tech/plugin-code-execution
pnpm add @mcpc-tech/plugin-code-execution

# jsr
npx jsr add @mcpc/plugin-code-execution
pnpm add jsr:@mcpc/plugin-code-execution
```

## Usage

### Basic Usage

```typescript
import { mcpc } from "@mcpc/core";
import { createCodeExecutionPlugin } from "@mcpc/plugin-code-execution/plugin";

const server = await mcpc(
  [{ name: "my-agent", version: "1.0.0" }, {
    capabilities: { tools: {} },
  }],
  [{
    name: "my-agent",
    description: `
      An agent that can execute JavaScript code securely.
      <tool name="filesystem.read_file"/>
      <tool name="filesystem.write_file"/>
    `,
    deps: {
      mcpServers: {
        "filesystem": {
          command: "npx",
          args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
          transportType: "stdio",
        },
      },
    },
    plugins: [
      createCodeExecutionPlugin({
        sandbox: {
          timeout: 30000, // 30 seconds
          memoryLimit: 512, // 512 MB
          permissions: [], // No extra permissions
        },
      }),
    ],
    options: {
      mode: "custom",
    },
  }],
);
```

### How It Works

The sandbox executor:

1. Spawns a Deno subprocess with restricted permissions
2. Sends code to execute via stdin (JSON-RPC)
3. When code calls `callMCPTool()`, it sends a JSON-RPC request
4. Host process receives request, calls actual MCP tool, returns result
5. Sandbox receives result and continues execution
6. Final output is returned via JSON-RPC response

### Security Model

The Deno sandbox runs with minimal permissions by default. You control access by
passing Deno permission flags directly:

```typescript
// No permissions - can only call MCP tools
createCodeExecutionPlugin();

// Allow network access to specific domains
createCodeExecutionPlugin({
  sandbox: {
    permissions: ["--allow-net=github.com,api.example.com"],
  },
});

// Allow reading specific directories
createCodeExecutionPlugin({
  sandbox: {
    permissions: ["--allow-read=/tmp,/var/log"],
  },
});
```

### Configuration Options

```typescript
interface SandboxConfig {
  timeout?: number; // Execution timeout in ms (default: 30000)
  memoryLimit?: number; // Memory limit in MB (default: unlimited)
  permissions?: string[]; // Deno flags, e.g., ["--allow-net", "--allow-read=/tmp"]
}
```

Example with custom permissions:

```typescript
createCodeExecutionPlugin({
  sandbox: {
    timeout: 60000,
    permissions: [
      "--allow-net=api.example.com",
      "--allow-read=/tmp",
      "--allow-env=HOME,USER",
    ],
  },
});
```

## Architecture

```
┌─────────────────┐
│   MCPC Agent    │
│   (Host Node)   │
└────────┬────────┘
         │ JSON-RPC
         │ (stdin/stdout)
         ↓
┌─────────────────┐
│  Deno Sandbox   │
│  (npm:deno)     │
│                 │
│  Execute Code   │
│  callMCPTool()  │
└─────────────────┘
```

## Examples

See `examples/` directory for complete examples:

- `basic-usage.ts` - Simple code execution with plugin integration

## Development

```bash
# Run tests
deno test --allow-all tests/

# Run example
deno run --allow-all examples/basic-usage.ts
```

## License

MIT
