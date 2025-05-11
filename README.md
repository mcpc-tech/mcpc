# [MCPC](https://mcpc.tech/) &middot; [![JSR](https://jsr.io/badges/@mcpc/code-runner-mcp)](https://jsr.io/@mcpc/core)

MCPC: One prompt instantly builds your scalable agentic MCP server from thousands of dependent MCPs.

> Read more at [Introducing MCPC: One Prompt for Your Agentic MCP Server, Powered by Thousands](https://x.com/yaoandyan/article/1921532787905237398)

1. One-Prompt General Automation Workflow Declaration;
2. Save token by internally calling dependent MCP servers;
3. Community & Custom MCPs Support.

# Getting Started

## 1. Get Started Instantly via Our Website

For the fastest and most straightforward path, simply visit mcpc.tech. Our user-friendly online platform provides an intuitive interface where you can declare your agentic workflows and provision your MCP servers with ease – all just with a few clicks. It's the ideal way to grasp the power of one-prompt automation firsthand.

![mcpc-tech-example](./images/mcpc-tech-example.png)

## 2. Integrate Deeply Using Code

For developers who prefer a programmatic approach, or for seamless integration into existing pipelines, MCP Compose offers robust code-based options. Leverage our comprehensive SDK, API, or CLI tools to declaratively define your workflows, compose MCPs. This method provides ultimate control and flexibility for advanced automation scenarios.
To get started, first install @mcpc/core SDK:

```bash
# Use with deno
deno install jsr:@mcpc/core
# Use with pnpm
pnpm install jsr:@mcpc/core
# Use with yarn
yarn add jsr:@mcpc/core
# Use with npm
npx jsr add @mcpc/core
```

Then create your composiable MCP server:

```typescript
import { StdioServerTransport } from "@modelcontextprotocol/sdk";
import { mcpc } from "@mcpc/core";

export const server = await mcpc(
  [
    {
      name: "mcpc",
      version: "0.1.0",
    },
    { capabilities: { tools: { listChanged: true } } },
  ],
  [
    {
      name: "tidy-folder",
      description: `Goal: Automatically keep the users folder tidy, organized, and free from clutter by intelligently classifying(with folders) and managing files(moving to corresponding folder).
Tools: <tool name="@wonderwhy-er/desktop-commander.list_directory"/> , <tool name="@wonderwhy-er/desktop-commander.create_directory"/> , <tool name="@wonderwhy-er/desktop-commander.move_file"/> 
`,
      deps: {
        mcpServers: {
          "@wonderwhy-er/desktop-commander": {
            command: "npx",
            args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
          },
        },
      },
    },
  ]
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

See more example code snippets at: https://github.com/mcpc-tech/mcpc/packages/core/examples
