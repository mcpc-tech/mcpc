# @mcpc/plugin-code-execution-sampling

[![JSR](https://jsr.io/badges/@mcpc/plugin-code-execution-sampling)](https://jsr.io/@mcpc/plugin-code-execution-sampling)
[![npm](https://img.shields.io/npm/v/@mcpc-tech/plugin-code-execution-sampling)](https://www.npmjs.com/package/@mcpc-tech/plugin-code-execution-sampling)

Combine secure sandboxed code execution with MCP sampling-backed model calls.
This package adds a `sampling()` host handler to the sandbox so code can call
back into the connected MCP client's model while still using MCP tools.

## Features

- **Secure sandbox execution** via `@mcpc/plugin-code-execution`
- **Model calls from sandbox code** via `sampling()`
- **Full tool loop support** by reusing `@mcpc/mcp-sampling-ai-provider` and AI
  SDK
- **Selective tool exposure** for sampling requests with `toolNames`

## Installation

```bash
# npm
npm install @mcpc-tech/plugin-code-execution-sampling
pnpm add @mcpc-tech/plugin-code-execution-sampling

# jsr
npx jsr add @mcpc/plugin-code-execution-sampling
pnpm add jsr:@mcpc/plugin-code-execution-sampling
```

## Usage

```typescript
import { mcpc } from "@mcpc/core";
import { createCodeExecutionSamplingPlugin } from "@mcpc/plugin-code-execution-sampling";

const server = await mcpc(
  [{ name: "my-agent", version: "1.0.0" }, {
    capabilities: { tools: {} },
  }],
  [{
    name: "my-agent",
    description: `
      You can execute JavaScript code and call the connected model.
      <tool name="filesystem.read_file"/>
      <tool name="filesystem.write_file"/>
    `,
    deps: {
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
          transportType: "stdio",
        },
      },
    },
    plugins: [
      createCodeExecutionSamplingPlugin({
        sandbox: {
          timeout: 30_000,
          permissions: [],
        },
        sampling: {
          maxSteps: 8,
          maxTokens: 4096,
        },
      }),
    ],
    options: {
      mode: "code_execution_sampling",
    },
  }],
);
```

Inside sandboxed JavaScript, you can now do both:

```typescript
const file = await callMCPTool("filesystem.read_file", { path: "README.md" });
const summary = await sampling({
  prompt: `Summarize this file:\n${JSON.stringify(file)}`,
  toolNames: ["filesystem.read_file"],
});
console.log(summary.text);
```

## `sampling()` API

### String shorthand

```typescript
const result = await sampling("Summarize the latest output");
console.log(result.text);
```

### Object form

```typescript
const result = await sampling({
  prompt: "Investigate the failing test and explain the root cause",
  systemPrompt: "You are a concise coding assistant",
  toolNames: ["filesystem.read_file", "terminal.execute_command"],
  maxSteps: 6,
  maxTokens: 4096,
  context: { cwd: "/repo" },
});
```

Returned shape:

```typescript
interface SandboxSamplingResult {
  text: string;
  finishReason: string;
  steps: unknown[];
  toolCalls: unknown[];
  toolResults: unknown[];
  usage: unknown;
}
```

## Notes

- `sampling()` requires the connected MCP client to advertise sampling support.
- Tool execution during sampling reuses the agent's tool set and host-side MCP
  calls.
- `@mcpc/plugin-code-execution` is still the right package when you only need
  sandbox execution without model calls.

## Examples

See `examples/basic-usage.ts` for a self-contained stdio server example built
around `code_execution_sampling`. It is designed to pair with any MCP client
that already supports sampling.

```bash
deno run --allow-all packages/plugin-code-execution-sampling/examples/basic-usage.ts
```
