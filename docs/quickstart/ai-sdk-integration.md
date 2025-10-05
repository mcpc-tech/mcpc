# AI SDK Integration

MCPC provides an AI SDK provider implementation that allows you to use MCP
(Model Context Protocol) sampling capabilities through the
[AI SDK](https://ai-sdk.dev/)'s standard provider interface.

## Package: @mcpc/ai-sdk-provider

The `@mcpc/ai-sdk-provider` package enables you to:

- **Use MCP servers with AI SDK**: Access MCP sampling through the familiar AI
  SDK interface
- **Leverage AI SDK features**: Use streaming, tool calling, and multi-turn
  conversations
- **Reuse agent capabilities**: Combine AI SDK's agent features with MCP servers
- **Seamless integration**: Switch between different LLM providers and MCP
  servers easily

## Installation

```bash
# Using Deno
deno add @mcpc/ai-sdk-provider

# Using npm
npm install @mcpc/ai-sdk-provider
```

## Quick Start

```typescript
import { createMCPProvider } from "@mcpc/ai-sdk-provider";
import { generateText } from "ai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Create MCP client
const client = new Client({
  name: "my-app",
  version: "1.0.0",
}, {
  capabilities: {
    sampling: {},
  },
});

// Connect to your MCP server
await client.connect(transport);

// Create provider
const mcp = createMCPProvider({ client });

// Use with AI SDK
const result = await generateText({
  model: mcp("my-agent-tool"),
  prompt: "What can you help me with?",
});

console.log(result.text);
```

## Using with MCPC Agents

You can use MCPC agentic tools as models in the AI SDK:

```typescript
import { mcpc } from "@mcpc/core";
import { createMCPProvider } from "@mcpc/ai-sdk-provider";

// Create MCPC server with sampling capability
const server = await mcpc(
  [{
    name: "my-agent-server",
    version: "1.0.0",
  }, {
    capabilities: {
      tools: {},
      sampling: {},
    },
  }],
  [{
    name: "code-analyzer",
    description: `Analyze code using available tools.
      <tool name="filesystem.read_file"/>
      <tool name="filesystem.list_directory"/>`,
    deps: {
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem"],
          transportType: "stdio",
        },
      },
    },
    options: {
      mode: "agentic",
    },
  }],
);

// In your client application
const mcp = createMCPProvider({ client });
const result = await generateText({
  model: mcp("code-analyzer"),
  prompt: "Analyze the project structure",
});
```

## Features

### Streaming Support

```typescript
import { streamText } from "ai";

const result = await streamText({
  model: mcp("my-agent"),
  prompt: "Tell me about this project",
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

**Note**: MCP sampling doesn't natively support streaming, so the implementation
returns the full response as a single chunk.

### System Prompts

```typescript
const result = await generateText({
  model: mcp("my-agent"),
  system: "You are a helpful assistant focused on code quality.",
  prompt: "Review this code",
});
```

### Multi-turn Conversations

```typescript
const messages = [
  { role: "user", content: "Read package.json" },
  { role: "assistant", content: "..." },
  { role: "user", content: "What are the dependencies?" },
];

const result = await generateText({
  model: mcp("my-agent"),
  messages: messages,
});
```

## Benefits

1. **Standardized Interface**: Use the same AI SDK patterns you're familiar with
2. **Provider Agnostic**: Easily switch between MCP servers and other AI
   providers
3. **Rich Ecosystem**: Access AI SDK's tools, helpers, and integrations
4. **Flexible Architecture**: Combine MCP's composability with AI SDK's features

## Documentation

For detailed documentation, see the
[@mcpc/ai-sdk-provider README](../../packages/ai-sdk-provider/README.md).

## Examples

- [Basic Usage](../../packages/ai-sdk-provider/examples/01-basic-usage.ts)
- [MCPC Integration](../../packages/ai-sdk-provider/examples/02-mcpc-integration.ts)

## Related

- [AI SDK Documentation](https://ai-sdk.dev/)
- [AI SDK Providers](https://ai-sdk.dev/providers/ai-sdk-providers)
- [MCP Specification](https://modelcontextprotocol.io/)
- [MCPC Framework](https://github.com/mcpc-tech/mcpc)
