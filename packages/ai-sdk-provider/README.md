# @mcpc/ai-sdk-provider

AI SDK provider implementation for MCP (Model Context Protocol) sampling
capabilities.

## Overview

This package provides an AI SDK provider that allows you to use MCP servers and
their sampling features through the [AI SDK](https://ai-sdk.dev/)'s standard
provider interface. This enables you to leverage AI SDK's agent capabilities
with MCP servers.

## Benefits

- **Reuse AI SDK features**: Use AI SDK's agent capabilities, tool calling, and
  workflow features with MCP servers
- **Standardized interface**: Work with MCP through the familiar AI SDK provider
  pattern
- **MCP sampling integration**: Leverage MCP's sampling capabilities for agentic
  workflows
- **Easy migration**: Switch between different LLM providers and MCP servers
  seamlessly

## Installation

```bash
# Using Deno
deno add @mcpc/ai-sdk-provider

# Using npm
npm install @mcpc/ai-sdk-provider
```

## Usage

### Basic Example

```typescript
import { createMCPProvider } from "@mcpc/ai-sdk-provider";
import { generateText } from "ai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Create MCP client
const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-everything"],
});

const client = new Client({
  name: "my-app",
  version: "1.0.0",
}, {
  capabilities: {
    sampling: {},
  },
});

await client.connect(transport);

// Create provider
const mcp = createMCPProvider({
  client: client,
});

// Use with AI SDK
const result = await generateText({
  model: mcp("my-agent-tool"),
  prompt: "What can you help me with?",
});

console.log(result.text);
```

### Using with MCPC Agents

```typescript
import { createMCPProvider } from "@mcpc/ai-sdk-provider";
import { generateText } from "ai";
import { mcpc } from "@mcpc/core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Create MCPC server with agentic tools
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
    name: "file-processor",
    description: `Process files using available tools.
      
      <tool name="filesystem.read"/>
      <tool name="filesystem.write"/>`,
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

// In your client application, create a client that connects to this server
// and use it with the AI SDK provider

const mcp = createMCPProvider({
  client: yourMCPClient, // Client connected to the server above
});

const result = await generateText({
  model: mcp("file-processor"),
  prompt: "Read the contents of package.json",
});
```

### Streaming

```typescript
import { streamText } from "ai";

const result = await streamText({
  model: mcp("my-agent"),
  prompt: "Tell me a story",
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

**Note**: MCP sampling doesn't natively support streaming, so the implementation
returns the full response as a single chunk. True streaming support would
require server-side implementation.

## API Reference

### `createMCPProvider(config: MCPProviderConfig): MCPProvider`

Creates an MCP provider instance.

**Parameters:**

- `config.client` - MCP client instance to use for sampling
- `config.modelId` - Optional default model ID
- `config.headers` - Optional headers for requests
- `config.baseUrl` - Optional base URL for display purposes

**Returns:** MCPProvider instance

### `MCPProvider.languageModel(modelId: string, options?: MCPProviderOptions): LanguageModelV1`

Creates a language model instance for a specific MCP tool/agent.

**Parameters:**

- `modelId` - The MCP tool name to use as the language model
- `options.headers` - Optional headers override

**Returns:** LanguageModelV1 instance compatible with AI SDK

## How It Works

The provider implements AI SDK's `LanguageModelV1` interface by:

1. Converting AI SDK messages to MCP sampling format
2. Calling the MCP server's `sampling/createMessage` method
3. Converting MCP responses back to AI SDK format
4. Mapping MCP stop reasons to AI SDK finish reasons

The `modelId` you provide to the provider corresponds to an MCP tool name that
supports sampling (typically an agentic or workflow tool created with MCPC).

## Limitations

- **Token counting**: MCP doesn't provide token counts, so usage reports will be
  0
- **Streaming**: MCP sampling doesn't natively support streaming; the stream
  implementation returns the complete response as a single chunk
- **Tool calls**: Currently focuses on text generation; tool call support would
  require additional MCP protocol extensions

## Related

- [AI SDK Documentation](https://ai-sdk.dev/)
- [AI SDK Providers](https://ai-sdk.dev/providers/ai-sdk-providers)
- [MCP Specification](https://modelcontextprotocol.io/)
- [MCPC Framework](https://github.com/mcpc-tech/mcpc)

## License

MIT
