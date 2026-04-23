# @mcpc/core — Complete Examples

## 01 · Basic Composition (agentic mode)

```typescript
// packages/core/examples/01-basic-composition.ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type ComposeDefinition, mcpc } from "@mcpc/core";

const toolDefinitions: ComposeDefinition[] = [{
  name: "file-organizer",
  description: `I am a smart file organizer.
Available tools:
<tool name="@wonderwhy-er/desktop-commander.list_directory"/>
<tool name="@wonderwhy-er/desktop-commander.create_directory"/>
<tool name="@wonderwhy-er/desktop-commander.move_file"/>
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
}];

const server = await mcpc(
  [{ name: "basic-file-manager", version: "1.0.0" }, {
    capabilities: { tools: { listChanged: true } },
  }],
  toolDefinitions,
);

await server.connect(new StdioServerTransport());
```

## 02 · Agentic Data Analyst

```typescript
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mcpc } from "@mcpc/core";

const server = await mcpc(
  [{ name: "agentic-data-analyst", version: "1.0.0" }, {
    capabilities: { tools: { listChanged: true } },
  }],
  [{
    name: "data-analyst",
    options: { mode: "agentic" },
    description: `Autonomous data analyst.
Available tools:
<tool name="code-runner.python-code-runner"/>
<tool name="@wonderwhy-er/desktop-commander.read_file"/>
<tool name="@wonderwhy-er/desktop-commander.write_file"/>`,
    deps: {
      mcpServers: {
        "code-runner": {
          command: "deno",
          args: ["run", "--allow-all", "jsr:@mcpc/code-runner-mcp/bin"],
          transportType: "stdio",
        },
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

## 07 · Runtime Transformation Plugins

```typescript
import { jsonSchema, mcpc } from "@mcpc/core";
import type { ToolPlugin } from "@mcpc/core";

const loggingPlugin: ToolPlugin = {
  name: "call-logger",
  transformInput: (args, context) => {
    console.log(`[INPUT] ${context.toolName}:`, JSON.stringify(args));
    return args;
  },
  transformOutput: (result, context) => {
    console.log(`[OUTPUT] ${context.toolName}:`, JSON.stringify(result));
    return result;
  },
};

const server = await mcpc(
  [{ name: "example-server", version: "1.0.0" }, {}],
  [],
  {
    setup: async (server) => {
      await server.addPlugin(loggingPlugin);
      server.tool(
        "greet",
        "Greet a user",
        jsonSchema({
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
        }),
        (args) => ({
          content: [{ type: "text", text: `Hello, ${args.name}!` }],
        }),
      );
    },
  },
);
```

## 14 · Skills Plugin

```typescript
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mcpc } from "@mcpc/core";
import { createSkillsPlugin } from "@mcpc/core/plugins";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "../../..");

const server = await mcpc(
  [{ name: "skills-demo", version: "1.0.0" }, {
    capabilities: { tools: { listChanged: true } },
  }],
  [{
    name: "slide-agent",
    options: { mode: "agentic" },
    description: "I am a presentation assistant using Slidev.",
    plugins: [
      createSkillsPlugin({ paths: [join(projectRoot, ".agents/skills")] }),
    ],
  }],
);

await server.connect(new StdioServerTransport());
```

## 15 · AI ACP Mode (Claude Code)

```typescript
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mcpc } from "@mcpc/core";

const server = await mcpc(
  [{ name: "ai-acp-demo", version: "1.0.0" }, {
    capabilities: { tools: {}, sampling: {} },
  }],
  [{
    name: "coding-agent",
    options: {
      mode: "ai_acp",
      maxSteps: 100,
      acpSettings: {
        command: "claude",
        args: [],
        session: { cwd: process.cwd() },
        persistSession: true,
      },
    },
    description: `Coding agent via Claude Code ACP.
<tool name="desktop-commander.__ALL__"/>`,
    deps: {
      mcpServers: {
        "desktop-commander": {
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

## 16 · Markdown Agent File

```typescript
import { mcpc } from "@mcpc/core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = await mcpc(
  [{ name: "mcpc-markdown-example", version: "1.0.0" }, {
    capabilities: { tools: {} },
  }],
  ["./agents/my-agent.md"],
  { plugins: ["@mcpc/plugin-markdown-loader"] },
);

await server.connect(new StdioServerTransport());
```

## 25 · Skills + Bash Combined

```typescript
import { mcpc } from "@mcpc/core";
import { createBashPlugin, createSkillsPlugin } from "@mcpc/core/plugins";
import { join } from "node:path";

const server = await mcpc(
  [{ name: "skills-bash-demo", version: "1.0.0" }, {
    capabilities: { tools: { listChanged: true } },
  }],
  [{
    name: "dev-assistant",
    options: { mode: "agentic" },
    description: `Development assistant with skills and bash.
<tool name="dev-assistant__load-skill"/>
<tool name="bash"/>`,
    plugins: [
      createSkillsPlugin({ paths: [".agents/skills"] }),
      createBashPlugin(),
    ],
  }],
);
```

## Claude Desktop Config

```json
{
  "mcpServers": {
    "my-agent": {
      "command": "deno",
      "args": ["run", "--allow-all", "/path/to/server.ts"]
    }
  }
}
```
