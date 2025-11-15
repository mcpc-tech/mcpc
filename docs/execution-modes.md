# Execution Modes

MCPC provides multiple flexible execution modes to fit different use cases, from
interactive agents to autonomous workflows and secure code execution. Each mode
is powered by dedicated executor implementations in
[`packages/core/src/executors/`](../packages/core/src/executors/).

## Mode Overview

| Mode                        | Description                                 | Use Case                                       | Requires Sampling |
| --------------------------- | ------------------------------------------- | ---------------------------------------------- | ----------------- |
| `agentic`                   | Interactive step-by-step execution          | Standard agent interactions                    | No                |
| `agentic_workflow`          | Structured workflow with steps              | Multi-step processes with defined structure    | No                |
| `agentic_sampling`          | Autonomous execution with internal LLM loop | Fully autonomous agents                        | Yes               |
| `agentic_workflow_sampling` | Autonomous workflow execution               | Complex autonomous workflows                   | Yes               |
| `code_execution`            | Secure JavaScript sandbox execution         | Code generation and execution with tool access | No                |

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

## 2. Agentic Workflow Mode

Structured agent execution with predefined or dynamically generated workflow
steps. Each step can include multiple actions.

### Configuration

```typescript
{
  options: { 
    mode: "agentic_workflow",
    steps: [/* optional predefined steps */],
    ensureStepActions: [/* required actions */]
  }
}
```

### Implementation

**Executor**:
[`executors/workflow/workflow-executor.ts`](../packages/core/src/executors/workflow/workflow-executor.ts)

### How It Works

**With Predefined Steps:**

```typescript
steps: [
  {
    description: "Analyze the codebase",
    actions: ["filesystem.read_file", "lsmcp.definition"],
  },
  {
    description: "Make changes",
    actions: ["filesystem.write_file"],
  },
  {
    description: "Create pull request",
    actions: ["github.create_pull_request"],
  },
];
```

**With Dynamic Steps:**

```typescript
// Omit steps - LLM will generate them based on the task
options: {
  mode: "agentic_workflow";
}
```

### Example

```typescript
const server = await mcpc(
  [{ name: "code-reviewer", version: "1.0.0" }, {
    capabilities: { tools: {} },
  }],
  [{
    name: "code-reviewer",
    description: `
      Code review agent with structured workflow.
      <tool name="filesystem.read_file"/>
      <tool name="lsmcp.definition"/>
      <tool name="github.create_pull_request"/>
    `,
    deps: {/* ... */},
    options: {
      mode: "agentic_workflow",
      steps: [
        {
          description: "Read and analyze code",
          actions: ["filesystem.read_file", "lsmcp.definition"],
        },
        {
          description: "Create review PR",
          actions: ["github.create_pull_request"],
        },
      ],
      ensureStepActions: ["github.create_pull_request"], // Must be included
    },
  }],
);
```

### When to Use

- Multi-step processes that follow a logical sequence
- When you want to enforce certain actions are taken
- Complex tasks that benefit from structured planning
- Scenarios where you want transparency in the execution flow

---

## 3. Agentic Sampling Mode

Autonomous execution using MCP's sampling capability. Runs an internal LLM loop
without user interaction until the task is complete or max iterations is
reached.

### Configuration

```typescript
{
  options: { 
    mode: "agentic_sampling",
    samplingConfig: {
      maxIterations: 10,      // Max LLM calls (default: 10)
      summarize: true         // Summarize results (default: true)
    }
  }
}
```

⚠️ **Requires**: `capabilities: { sampling: {} }` in server configuration

### Implementation

**Executor**:
[`executors/sampling/agentic-sampling-executor.ts`](../packages/core/src/executors/sampling/agentic-sampling-executor.ts)

### How It Works

1. Client invokes the sampling tool
2. Server starts internal LLM loop
3. LLM autonomously calls tools and processes results
4. Loop continues until task complete or max iterations
5. Final result (or summary) returned to client

### Example

```typescript
const server = await mcpc(
  [
    { name: "autonomous-agent", version: "1.0.0" },
    { capabilities: { tools: {}, sampling: {} } }, // sampling required!
  ],
  [{
    name: "autonomous-agent",
    description: `
      Fully autonomous agent that can work independently.
      <tool name="filesystem.__ALL__"/>
      <tool name="terminal.execute_command"/>
    `,
    deps: {/* ... */},
    options: {
      mode: "agentic_sampling",
      samplingConfig: {
        maxIterations: 20,
        summarize: true,
      },
    },
  }],
);
```

### When to Use

- Long-running autonomous tasks
- When you want the agent to work independently
- Background processing scenarios
- Supported by MCP clients like VS Code, Cline, etc.

### Client Support

Sampling mode requires client support. Compatible clients include:

- VS Code with MCP extension
- Cline
- Other clients implementing MCP sampling protocol

---

## 4. Agentic Workflow Sampling Mode

Combines the structure of workflow mode with the autonomy of sampling mode.
Executes a predefined or dynamic workflow autonomously.

### Configuration

```typescript
{
  options: { 
    mode: "agentic_workflow_sampling",
    steps: [/* optional workflow steps */],
    samplingConfig: { maxIterations: 10 }
  }
}
```

⚠️ **Requires**: `capabilities: { sampling: {} }` in server configuration

### Implementation

**Executor**:
[`executors/sampling/workflow-sampling-executor.ts`](../packages/core/src/executors/sampling/workflow-sampling-executor.ts)

### Example

```typescript
const server = await mcpc(
  [
    { name: "build-agent", version: "1.0.0" },
    { capabilities: { tools: {}, sampling: {} } },
  ],
  [{
    name: "build-agent",
    description: "Autonomous build and deploy agent",
    deps: {/* ... */},
    options: {
      mode: "agentic_workflow_sampling",
      steps: [
        { description: "Run tests", actions: ["terminal.execute_command"] },
        { description: "Build project", actions: ["terminal.execute_command"] },
        { description: "Deploy", actions: ["deployment.deploy"] },
      ],
      samplingConfig: {
        maxIterations: 15,
        summarize: true,
      },
    },
  }],
);
```

### When to Use

- Autonomous execution of complex multi-step workflows
- CI/CD pipelines and automated deployments
- Background tasks with structured steps
- When you need both workflow structure and autonomous execution

---

## 5. Code Execution Mode

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

| Scenario                                | Recommended Mode            |
| --------------------------------------- | --------------------------- |
| Simple interactive agent                | `agentic`                   |
| Multi-step process with clear structure | `agentic_workflow`          |
| Long-running autonomous task            | `agentic_sampling`          |
| Autonomous structured workflow          | `agentic_workflow_sampling` |
| Code generation and execution           | `code_execution`            |
| Data processing with tool access        | `code_execution`            |

## Configuration Reference

### SamplingConfig

```typescript
interface SamplingConfig {
  maxIterations?: number; // Max LLM calls (default: 10)
  summarize?: boolean; // Summarize results (default: true)
}
```

### WorkflowStep

```typescript
interface MCPCStep {
  description: string; // Step description
  actions: string[]; // Tool names for this step
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
- `packages/core/src/plugins/built-in/mode-workflow-plugin.ts`
- `packages/core/src/plugins/built-in/mode-agentic-sampling-plugin.ts`
- `packages/core/src/plugins/built-in/mode-workflow-sampling-plugin.ts`

The code execution mode is a separate plugin package that can be installed and
used independently.
