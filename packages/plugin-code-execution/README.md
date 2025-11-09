# @mcpc/agentic-js-sandbox

Secure JavaScript code execution sandbox using Deno for MCPC agents. This
package provides a safe environment to execute user-provided JavaScript code
with MCP tool access via JSON-RPC IPC.

## Features

- 🔒 **Secure Sandboxing**: Uses Deno's permission system for isolated code
  execution
- 🔌 **JSON-RPC IPC**: Tool calls are transmitted via JSON-RPC between sandbox
  and host
- 🚀 **Easy Integration**: Drop-in replacement for the built-in code execution
  mode
- 📦 **Zero Config**: Automatically locates Deno binary from npm package
- 🛡️ **Resource Limits**: Configurable timeouts and memory limits

## Installation

```bash
npm install @mcpc/agentic-js-sandbox
# or
pnpm add @mcpc/agentic-js-sandbox
# or
yarn add @mcpc/agentic-js-sandbox
```

## Usage

### Basic Usage

```typescript
import { mcpc } from "@mcpc/core";
import { createSandboxExecutor } from "@mcpc/agentic-js-sandbox";

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
    options: {
      mode: "code_execution",
      // Use custom sandbox executor
      customExecutor: createSandboxExecutor({
        timeout: 30000, // 30 seconds
        memoryLimit: 512, // 512 MB
      }),
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
createSandboxExecutor();

// Allow network access to specific domains
createSandboxExecutor({
  permissions: ["--allow-net=github.com,api.example.com"],
});

// Allow reading specific directories
createSandboxExecutor({
  permissions: ["--allow-read=/tmp,/var/log"],
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
createSandboxExecutor({
  timeout: 60000,
  permissions: [
    "--allow-net=api.example.com",
    "--allow-read=/tmp",
    "--allow-env=HOME,USER",
  ],
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

## Comparison with Built-in Executor

| Feature     | Built-in (`new Function`) | Sandbox (`npm:deno`)        |
| ----------- | ------------------------- | --------------------------- |
| Security    | Low (same process)        | High (isolated)             |
| Performance | Fast                      | Slower (IPC overhead)       |
| Permissions | Full Node.js access       | Restricted                  |
| Setup       | Zero deps                 | Requires `deno` npm package |

## Examples

See `examples/` directory for complete examples:

- `basic-usage.ts` - Simple code execution
- `file-operations.ts` - Working with filesystem MCP tools
- `custom-permissions.ts` - Custom Deno permissions

## Development

```bash
# Run tests
deno test --allow-all tests/

# Run example
deno run --allow-all examples/basic-usage.ts
```

## License

MIT
