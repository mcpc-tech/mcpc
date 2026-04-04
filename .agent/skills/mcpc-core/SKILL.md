---
name: mcpc-core
description: Build agentic MCP servers using @mcpc/core by composing existing MCP tools. Use when creating, extending, or debugging MCPC agentic servers — including setting up compositions, choosing execution modes, writing plugins, loading skills, and connecting transports.
---

# @mcpc/core — Build Agentic MCP Servers

`@mcpc/core` lets you compose existing MCP tools into agentic MCP tools. You
write a description that references tools via `<tool>` XML tags, and MCPC wires
everything up into a working MCP server.

## Installation

```bash
# Deno (preferred in this repo)
deno add jsr:@mcpc/core

# npm
npm install @mcpc-tech/core

# pnpm (from JSR)
pnpm add jsr:@mcpc/core
```

## Minimal Example

```typescript
import { mcpc } from "@mcpc/core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = await mcpc(
  [{ name: "my-agent", version: "1.0.0" }, { capabilities: { tools: {} } }],
  [{
    name: "file-agent",
    description: `I help manage files.
Available tools:
<tool name="@wonderwhy-er/desktop-commander.read_file"/>
<tool name="@wonderwhy-er/desktop-commander.write_file"/>`,
    deps: {
      mcpServers: {
        "@wonderwhy-er/desktop-commander": {
          command: "npx",
          args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
          transportType: "stdio",
        },
      },
    },
  }],
);

await server.connect(new StdioServerTransport());
```

## Core API

### `mcpc(serverConf, composeConf?, options?)`

| Param         | Type                               | Description                                              |
| ------------- | ---------------------------------- | -------------------------------------------------------- |
| `serverConf`  | `[ServerMeta, ServerCapabilities]` | Name/version + capabilities tuple                        |
| `composeConf` | `ComposeInput[]`                   | Array of `ComposeDefinition` objects or `.md` file paths |
| `options`     | `McpcOptions`                      | Loader plugins + setup callback                          |

Returns `Promise<ComposableMCPServer>`.

### `ComposeDefinition`

```typescript
{
  name: string | null,          // null = composition-only (no tool exposed)
  description?: string,         // Natural language + <tool> XML refs
  manual?: string,              // Progressive disclosure: long docs hidden behind man tool
  deps?: MCPSetting,            // Dependent MCP servers to connect
  plugins?: (ToolPlugin | string)[],  // Runtime plugins
  options?: {
    mode?: "agentic" | "ai_sampling" | "ai_acp",  // default: "agentic"
    maxSteps?: number,          // default: 50
    maxTokens?: number,         // default: 128_000 (ai_sampling only)
    samplingConfig?: SamplingConfig,
    providerOptions?: { modelPreferences?: {...} },  // ai_sampling only
    acpSettings?: { command, args, env, session, persistSession },  // ai_acp only
    tracingEnabled?: boolean,   // OpenTelemetry
    refs?: ToolRefXml[],
  }
}
```

## Tool References (`<tool>` XML)

In the `description` field, reference tools with XML tags:

```
<tool name="server.tool_name"/>              — specific tool
<tool name="server.__ALL__"/>               — all tools from a server
<tool name="server.tool" maxResultLength="2000"/>  — truncate large results
<tool name="server.tool" hide/>             — use internally, hide from public API
<tool name="server.tool" global/>           — expose at top-level scope
```

## MCP Server Dependencies (`deps.mcpServers`)

Three transport types:

```typescript
// stdio
"my-server": { command: "npx", args: ["-y", "pkg@latest"], transportType: "stdio" }

// Streamable HTTP
"remote": { transportType: "streamable-http", url: "https://api.example.com/mcp/",
            headers: { "Authorization": "Bearer ${TOKEN}" } }

// SSE
"sse-server": { transportType: "sse", url: "https://api.example.com/sse/" }
```

## Execution Modes

| Mode          | Description                                      | Best For                        |
| ------------- | ------------------------------------------------ | ------------------------------- |
| `agentic`     | Fully autonomous, uses MCP sampling              | Default; most flexible          |
| `ai_sampling` | Uses AI SDK `streamText` + MCP sampling provider | When you control the model      |
| `ai_acp`      | AI SDK + ACP protocol for coding agents          | Claude Code, Codex-style agents |

## Plugins

### Built-in Plugins (import from `@mcpc/core/plugins`)

```typescript
import {
  createBashPlugin, // Add bash execution tool
  createLargeResultPlugin, // Truncate/paginate large tool results
  createSearchPlugin, // Add ripgrep-based search tool
  createSkillsPlugin, // Lazy-load skill knowledge
} from "@mcpc/core/plugins";
```

### Using Plugins

```typescript
// In ComposeDefinition
plugins: [
  createLargeResultPlugin({ maxSize: 8000 }),
  createSkillsPlugin({ paths: [".agent/skills"] }),
  createBashPlugin(),
  "./my-plugin.ts?param=value", // File path with query params
];

// Or in mcpc() options (loader plugins, run before composition)
await mcpc(serverConf, composeConf, {
  plugins: ["@mcpc/plugin-markdown-loader"],
});
```

### Writing a Custom Plugin (`ToolPlugin`)

```typescript
import type { ToolPlugin } from "@mcpc/core";

const myPlugin: ToolPlugin = {
  name: "my-plugin",

  // Mutate/filter tool descriptions at compose time
  transformTool?: (tool: ComposedTool, ctx: TransformContext) => ComposedTool,

  // Intercept inputs before execution
  transformInput?: (args: unknown, ctx: BeforeToolExecuteContext) => unknown,

  // Intercept outputs after execution
  transformOutput?: (result: unknown, ctx: AfterToolExecuteContext) => unknown,

  // Lifecycle hooks
  onComposeStart?: (ctx: ComposeStartContext) => void,
  onComposeEnd?: (ctx: ComposeEndContext) => void,
  onFinalize?: (ctx: FinalizeContext) => void,
};
```

## Skills Plugin

`createSkillsPlugin` adds a `{agent}__load-skill` tool that lazy-loads skill
content:

```typescript
createSkillsPlugin({
  paths: [join(projectRoot, ".agent/skills")],
});
```

Skills directory structure:

```
.agent/skills/
└── my-skill/
    ├── SKILL.md          ← main instructions (loaded by default)
    └── references/
        └── api.md        ← loaded via { skill, ref: "references/api.md" }
```

Agent calls:

```
agent__load-skill({ skill: "my-skill" })
agent__load-skill({ skill: "my-skill", ref: "references/api.md" })
```

## Markdown Agent Files

Load agent definitions from `.md` files (requires
`@mcpc/plugin-markdown-loader`):

```typescript
await mcpc(
  [{ name: "server", version: "1.0.0" }, { capabilities: { tools: {} } }],
  ["./agents/my-agent.md"],
  { plugins: ["@mcpc/plugin-markdown-loader"] },
);
```

Markdown format:

```markdown
---
name: my-agent
deps:
  mcpServers:
    some-server:
      command: npx
      args: ["-y", "some-server"]
      transportType: stdio
options:
  mode: agentic
---

I am an agent that does X.

<tool name="some-server.tool"/>
```

## Setup Callback (Custom Tools)

Register tools directly on the server before composition:

```typescript
import { jsonSchema } from "@mcpc/core";

await mcpc(serverConf, composeConf, {
  setup: async (server) => {
    server.tool(
      "my-tool",
      "Description of tool",
      jsonSchema({ type: "object", properties: { input: { type: "string" } } }),
      async (args) => ({
        content: [{ type: "text", text: `Got: ${args.input}` }],
      }),
    );
    await server.addPlugin(myPlugin);
  },
});
```

## Gotchas

- **`transportType` is required** in every `mcpServers` entry — omitting it
  causes a silent failure.
- **`name: null`** in `ComposeDefinition` skips creating the composed tool;
  useful for composition-only (just wiring up deps + plugins).
- **Plugin load order matters**: `McpcOptions.plugins` run before composition
  (use for loaders). `ComposeDefinition.plugins` run after composition (use for
  runtime transforms).
- **`hide` vs `global` on `<tool>`**: `hide` keeps a tool internal to the agent.
  `global` exposes it at top-level without a namespace prefix.
- **`manual` field**: if set, `description` becomes a short summary and full
  content is behind a `man` tool call — reduces initial context size.
- **Environment variables in headers**: use `${VAR_NAME}` syntax inside strings
  in `deps.mcpServers[*].headers` — MCPC expands them at runtime.
- **`maxSteps` default is 50** for ai_sampling/ai_acp modes — increase for
  complex multi-step tasks.

## References

- See `references/examples.md` for complete working examples
- Source: https://github.com/mcpc-tech/mcpc/tree/main/packages/core
- Docs: https://github.com/mcpc-tech/mcpc/tree/main/docs
