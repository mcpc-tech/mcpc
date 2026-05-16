# Execution Modes

MCPC provides multiple flexible execution modes to fit different use cases, from
interactive agents to autonomous execution and secure code execution. Each mode
is powered by dedicated executor implementations in
[`packages/core/src/executors/`](../packages/core/src/executors/).

## Mode Overview

| Mode                      | Description                                   | Use Case                                             | Requires Plugin | Requires Sampling |
| ------------------------- | --------------------------------------------- | ---------------------------------------------------- | --------------- | ----------------- |
| `agentic`                 | Interactive step-by-step execution            | Standard agent interactions                          | Built-in        | No                |
| `ai_sampling`             | AI SDK sampling mode                          | Autonomous execution with AI SDK                     | Built-in        | Yes               |
| `ai_acp`                  | AI SDK ACP mode                               | Coding agents (Claude Code, etc.)                    | Built-in        | No                |
| `code_execution`          | Secure JavaScript sandbox execution           | Code generation and execution with tool access       | External        | No                |
| `code_execution_sampling` | Secure sandbox plus MCP sampling-backed calls | Sandbox execution that can also ask the client model | External        | Yes               |

> **Note:** `agentic`, `ai_sampling`, and `ai_acp` are built-in modes — just set
> `options.mode` and they work. `code_execution` and `code_execution_sampling`
> require installing and loading their respective plugin packages.

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

### Progressive Manual Disclosure

For complex agents with detailed instructions, you can use the `manual` field to
reduce initial prompt length:

- **`description`**: Short summary shown in tool listing (saves tokens)
- **`manual`**: Full documentation fetched on-demand via `man { manual: true }`

Both fields support `<tool>` tag references.

```typescript
{
  name: "code-reviewer",
  description: "AI code reviewer for code quality and security analysis.",
  manual: `Detailed instructions for the code reviewer...
  
Available tools:
<tool name="filesystem.read_file"/>
<tool name="filesystem.write_file"/>

## Review Categories
1. Code Quality - readability, naming, complexity
2. Security - SQL injection, XSS, credentials
3. Performance - algorithm efficiency, memory leaks
...`,
  deps: {/* ... */},
}
```

The LLM can request the full manual when needed:

- `man { tools: ["filesystem.read_file"] }` - Get tool schemas
- `man { tools: [], manual: true }` - Get manual only
- `man { tools: ["filesystem.read_file"], manual: true }` - Get both

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

> **Requires external plugin:** This mode is not built-in. You must install and
> load `@mcpc/plugin-code-execution` explicitly. See Installation below.

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

## 5. Code Execution Sampling Mode

> **Requires external plugin:** This mode is not built-in. You must install and
> load `@mcpc/plugin-code-execution-sampling` explicitly.

Combines the secure Deno sandbox from `code_execution` mode with MCP
sampling-backed LLM calls. Sandboxed code can invoke a `sampling` handler to ask
the client model for reasoning, making it suitable for tasks that need both code
execution and AI reasoning.

### Installation

```bash
npm install @mcpc-tech/plugin-code-execution-sampling
# or
npx jsr add @mcpc/plugin-code-execution-sampling
```

### Configuration

```typescript
import { createCodeExecutionSamplingPlugin } from "@mcpc/plugin-code-execution-sampling";

{
  plugins: [
    createCodeExecutionSamplingPlugin({
      sandbox: {
        timeout: 30000,
        memoryLimit: 512,
        permissions: [],
      },
      sampling: {
        maxSteps: 50,
        maxTokens: 128_000,
      },
    }),
  ],
  options: {
    mode: "code_execution_sampling",
  },
}
```

> **Requires**: `capabilities: { sampling: {} }` in client

### Implementation

**Plugin**:
[`packages/plugin-code-execution-sampling/src/plugin.ts`](../packages/plugin-code-execution-sampling/src/plugin.ts)

### How It Works

1. LLM generates JavaScript code to execute (same `man`/`exec` interface as
   `code_execution`)
2. Code runs in secure Deno sandbox with access to MCP tools via `callMCPTool`
3. Sandboxed code can call `callMCPSampling(prompt, context)` to invoke the
   client model for reasoning
4. Results from both MCP tools and sampling calls are returned to the LLM

### When to Use

- Sandbox execution that also needs model reasoning
- Tasks requiring both deterministic code and AI judgment
- Structured sampling inside sandboxed programs

### Example

```typescript
import { mcpc } from "@mcpc/core";
import { createCodeExecutionSamplingPlugin } from "@mcpc/plugin-code-execution-sampling";

const server = await mcpc(
  [{ name: "analyzer", version: "1.0.0" }, {
    capabilities: { tools: {}, sampling: {} },
  }],
  [{
    name: "analyzer",
    description: `
      Code analysis agent with sampling.
      <tool name="filesystem.read_file"/>
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
      createCodeExecutionSamplingPlugin({
        sandbox: { timeout: 30000 },
        sampling: { maxSteps: 30 },
      }),
    ],
    options: {
      mode: "code_execution_sampling",
    },
  }],
);
```

---

## Choosing the Right Mode

| Scenario                                      | Recommended Mode          |
| --------------------------------------------- | ------------------------- |
| Simple interactive agent                      | `agentic`                 |
| Autonomous AI SDK execution                   | `ai_sampling`             |
| Coding agent integration                      | `ai_acp`                  |
| Code generation and execution                 | `code_execution`          |
| Data processing with tool access              | `code_execution`          |
| Sandbox execution plus model reasoning        | `code_execution_sampling` |
| Structured sampling inside sandboxed programs | `code_execution_sampling` |

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

Execution modes are implemented as plugins that hook into the
`registerAgentTool` lifecycle. Each mode has a corresponding plugin that
implements its execution strategy.

**Built-in plugins** (loaded automatically, included in `getBuiltInPlugins()`):

- [`packages/core/src/plugins/built-in/mode-agentic-plugin.ts`](../packages/core/src/plugins/built-in/mode-agentic-plugin.ts)
  — `agentic`
- [`packages/core/src/plugins/built-in/mode-ai-sampling-plugin.ts`](../packages/core/src/plugins/built-in/mode-ai-sampling-plugin.ts)
  — `ai_sampling`
- [`packages/core/src/plugins/built-in/mode-ai-acp-plugin.ts`](../packages/core/src/plugins/built-in/mode-ai-acp-plugin.ts)
  — `ai_acp`

**External plugin packages** (must be installed and loaded via `plugins`):

- [`packages/plugin-code-execution`](../packages/plugin-code-execution) —
  `code_execution`
- [`packages/plugin-code-execution-sampling`](../packages/plugin-code-execution-sampling)
  — `code_execution_sampling`

To add an external mode:

```typescript
import { createCodeExecutionPlugin } from "@mcpc/plugin-code-execution";

const server = await mcpc(
  [{ name: "s", version: "1.0.0" }, { capabilities: { tools: {} } }],
  [{
    name: "agent",
    // ...
    plugins: [createCodeExecutionPlugin()],
    options: { mode: "code_execution" },
  }],
);
```
