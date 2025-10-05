# AI SDK Integration

The AI SDK by Vercel provides excellent support for Model Context Protocol (MCP)
tools. This guide shows you how to integrate your MCPC agentic server with the
AI SDK to build powerful AI applications.

## Integration Methods

There are two ways to integrate MCPC with the AI SDK:

1. **Transport-based Integration** (This guide): Connect to MCPC server through
   MCP transport protocols (stdio, HTTP, SSE). Best for distributed systems and
   external clients.
2. **[Direct Server Integration](./direct-server-integration.md)**: Use the MCPC
   server instance directly in the same process. Best for standalone
   applications and maximum performance.

## Overview

MCPC servers can be used as MCP servers in the AI SDK ecosystem. The AI SDK's
`experimental_createMCPClient` function allows you to connect to any MCP server,
including your MCPC agentic tools, and use them seamlessly in your AI
applications.

## Prerequisites

First, install the required dependencies:

```bash
npm install ai @ai-sdk/openai @modelcontextprotocol/sdk
```

## Setting Up Your MCPC Server

Before connecting from the AI SDK, you need a running MCPC server. Here's a
simple example:

```typescript
// server.ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mcpc } from "@mcpc/core";

const server = await mcpc(
  [
    {
      name: "coding-agent",
      version: "0.1.0",
    },
    { capabilities: { tools: {} } },
  ],
  [
    {
      name: "coding-agent",
      description: `You are a coding assistant that helps with file operations.

Available tools:
<tool name="desktop-commander.read_file"/>
<tool name="desktop-commander.write_file"/>
<tool name="desktop-commander.list_directory"/>`,
      options: {
        mode: "agentic",
      },
      deps: {
        mcpServers: {
          "desktop-commander": {
            command: "npx",
            args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
            transportType: "stdio",
          },
        },
      },
    },
  ],
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

## Connecting with AI SDK

### Stdio Transport (Local Development)

For local development, use the stdio transport to connect to your MCPC server:

```typescript
import { experimental_createMCPClient as createMCPClient } from "ai";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const mcpClient = await createMCPClient({
  transport: new StdioClientTransport({
    command: "npx",
    args: ["tsx", "server.ts"], // or 'node', 'dist/server.js' for compiled code
  }),
});
```

## Using MCPC Tools

### Schema Discovery (Automatic)

The simplest approach is to let the AI SDK automatically discover all tools from
your MCPC server:

```typescript
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

// Get all tools from MCPC server
const tools = await mcpClient.tools();

// Use with AI SDK
const result = await generateText({
  model: openai("gpt-4o"),
  tools,
  prompt: "List all files in the current directory and analyze their contents",
});

console.log(result.text);
```

### Schema Definition (Type-Safe)

For better TypeScript support and explicit control, define tool schemas:

```typescript
import { z } from "zod";

const tools = await mcpClient.tools({
  schemas: {
    "coding-agent": {
      inputSchema: z.object({
        userRequest: z.string().describe(
          "The task or request for the coding agent",
        ),
        context: z.object({
          workingDirectory: z.string().optional(),
        }).optional(),
      }),
    },
  },
});

const result = await generateText({
  model: openai("gpt-4o"),
  tools,
  prompt: "Create a new README.md file with project documentation",
});
```

## When to Use Transport-based Integration

Use this transport-based approach when:

- Your MCPC server runs as a separate service or process
- You need to share the server across multiple clients
- You're integrating with external AI clients (VS Code, Claude Desktop, etc.)
- You need language-agnostic access to your tools

For same-process integration with better performance, see
[Direct Server Integration](./direct-server-integration.md).

## Additional Resources

- [Direct Server Integration](./direct-server-integration.md) - Use MCPC server
  directly without transport layer
- [AI SDK Documentation](https://ai-sdk.dev/docs)
- [AI SDK MCP Tools Guide](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools)
- [MCP Cookbook Example](https://ai-sdk.dev/cookbook/node/mcp-tools)
- [MCPC CLI Usage](./cli-usage.md)
- [Create Your First Agentic MCP](./create-your-first-agentic-mcp.md)
