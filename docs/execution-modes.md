# Execution Modes

MCPC provides multiple flexible execution modes to fit different use cases, from
interactive agents to autonomous execution and secure code execution. Each mode
is powered by dedicated executor implementations in
[`packages/core/src/executors/`](../packages/core/src/executors/).

## Mode Overview

| Mode             | Description                         | Use Case                                       | Requires Sampling |
| ---------------- | ----------------------------------- | ---------------------------------------------- | ----------------- |
| `agentic`        | Interactive step-by-step execution  | Standard agent interactions                    | No                |
| `ai_sampling`    | AI SDK sampling mode                | Autonomous execution with AI SDK               | Yes               |
| `ai_acp`         | AI SDK ACP mode                     | Coding agents (Claude Code, etc.)              | No                |
| `code_execution` | Secure JavaScript sandbox execution | Code generation and execution with tool access | No                |

## 1. Agentic Mode (default)

Interactive agent that calls tools step-by-step, with the LLM deciding each next
action based on previous results.

### Configuration

```typescript
{
  options: {
    mode: "agentic"; // Default, can be omitted
  }
}
```

### Implementation

**Executor**:
[`executors/agentic/agentic-executor.ts`](../packages/core/src/executors/agentic/agentic-executor.ts)

### How It Works

1. LLM receives tool descriptions and decides which tool to call
2. Tool is executed and result is returned
3. LLM sees result and decides next action
4. Process repeats until task is complete

### Example

```typescript
import { mcpc } from "@mcpc/core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = await mcpc(
  [{ name: "my-agent", version: "1.0.0" }, { capabilities: { tools: {} } }],
  [{
    name: "my-agent",
    description: `
      A helpful assistant.
      <tool name="weather.get_forecast"/>
      <tool name="calendar.add_event"/>
    `,
    deps: {/* ... */},
    options: { mode: "agentic" }, // Can be omitted
  }],
);

await server.connect(new StdioServerTransport());
```

### When to Use

- Standard interactive agent scenarios
- When you want the LLM to have full control over tool selection
- Simple single-purpose agents
- Real-time user interactions

---

## 2. AI Sampling Mode

Autonomous execution using AI SDK with MCP sampling provider. The agent runs
autonomously using the AI SDK's streamText function.

### Configuration

```typescript
{
  options: { 
    mode: "ai_sampling",
    maxSteps: 50,
    tracingEnabled: true
  }
}
```

⚠️ **Requires**: `capabilities: { sampling: {} }` in client

### Implementation

**Plugin**:
[`plugins/built-in/mode-ai-sampling-plugin.ts`](../packages/core/src/plugins/built-in/mode-ai-sampling-plugin.ts)

### When to Use

- Autonomous execution with AI SDK
- Long-running tasks
- When you need MCP sampling protocol support

---

## 3. AI ACP Mode

AI SDK mode for coding agents like Claude Code, using the ACP (Agent Control
Protocol) provider.

### Configuration

```typescript
{
  options: { 
    mode: "ai_acp",
    acpSettings: {
      command: "claude-code",
      args: ["--mcp"],
      session: {
        cwd: "/path/to/project"
      }
    },
    maxSteps: 50
  }
}
```

### Implementation

**Plugin**:
[`plugins/built-in/mode-ai-acp-plugin.ts`](../packages/core/src/plugins/built-in/mode-ai-acp-plugin.ts)

### When to Use

- Integration with coding agents (Claude Code, etc.)
- When you need ACP protocol support
- Complex coding tasks

---

## 4. Code Execution Mode

Secure JavaScript code execution in a Deno sandbox with bidirectional JSON-RPC
communication for MCP tool access. Features progressive tool disclosure to
minimize context usage.

### Configuration

```typescript
import { createCodeExecutionPlugin } from "@mcpc/plugin-code-execution/plugin";

{
  plugins: [
    createCodeExecutionPlugin({
      sandbox: {
        timeout: 30000,        // Execution timeout (ms)
        memoryLimit: 512,      // Memory limit (MB)
        permissions: []        // Deno permissions
      }
    })
  ],
  options: {
    mode: "code_execution"
  }
}
```

### Installation

```bash
npm install @mcpc-tech/plugin-code-execution
# or
npx jsr add @mcpc/plugin-code-execution
```

### Implementation

**Plugin**:
[`packages/plugin-code-execution/src/plugin.ts`](../packages/plugin-code-execution/src/plugin.ts)

### How It Works

1. LLM generates JavaScript code to execute
2. Code runs in secure Deno sandbox
3. Code can call `callMCPTool(toolName, params)` to use MCP tools
4. Tool calls use JSON-RPC IPC between sandbox and host
5. Execution result returned to LLM

### Progressive Tool Disclosure

The plugin uses a smart context management pattern:

```typescript
// First call - request tool schemas
{
  definitionsOf: ["filesystem.read_file", "terminal.execute_command"],
  hasDefinitions: []
}

// Second call - execute code with known tools
{
  code: `
    const content = await callMCPTool("filesystem.read_file", { path: "README.md" });
    console.log(content);
  `,
  hasDefinitions: ["filesystem.read_file", "terminal.execute_command"]
}
```

### Example

```typescript
import { mcpc } from "@mcpc/core";
import { createCodeExecutionPlugin } from "@mcpc/plugin-code-execution/plugin";

const server = await mcpc(
  [{ name: "code-agent", version: "1.0.0" }, { capabilities: { tools: {} } }],
  [{
    name: "code-agent",
    description: `
      Secure code execution agent.
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
          timeout: 30000,
          permissions: [], // No extra permissions
        },
      }),
    ],
    options: {
      mode: "code_execution",
    },
  }],
);
```

### Security Model

Deno sandbox runs with minimal permissions by default:

```typescript
// No permissions - can only call MCP tools
createCodeExecutionPlugin();

// Allow network to specific domains
createCodeExecutionPlugin({
  sandbox: {
    permissions: ["--allow-net=api.example.com"],
  },
});

// Allow reading specific files
createCodeExecutionPlugin({
  sandbox: {
    permissions: ["--allow-read=/tmp"],
  },
});
```

### When to Use

- Code generation and execution scenarios
- Data processing and transformation tasks
- When you need complex logic that's easier to express in code
- Scenarios requiring iterative computation
- When you want fine-grained control over sandbox permissions

### Learn More

See the
[code execution plugin documentation](../packages/plugin-code-execution/README.md)
for detailed information.

---

## Choosing the Right Mode

| Scenario                          | Recommended Mode |
| --------------------------------- | ---------------- |
| Simple interactive agent          | `agentic`        |
| Autonomous AI SDK execution       | `ai_sampling`    |
| Coding agent integration          | `ai_acp`         |
| Code generation and execution     | `code_execution` |
| Data processing with tool access  | `code_execution` |

## Configuration Reference

### SamplingConfig

```typescript
interface SamplingConfig {
  maxIterations?: number; // Max LLM calls (default: 10)
  summarize?: boolean; // Summarize results (default: true)
}
```

### CodeExecutionConfig

```typescript
interface SandboxConfig {
  timeout?: number; // Execution timeout in ms
  memoryLimit?: number; // Memory limit in MB
  permissions?: string[]; // Deno permission flags
}
```

## Advanced: Mode Plugins

Each execution mode is implemented as a built-in plugin. You can find them in:

- `packages/core/src/plugins/built-in/mode-agentic-plugin.ts`
- `packages/core/src/plugins/built-in/mode-ai-sampling-plugin.ts`
- `packages/core/src/plugins/built-in/mode-ai-acp-plugin.ts`

The code execution mode is a separate plugin package that can be installed and
used independently.
