# @mcpc/ai-sdk-mcp-sampling-provider

AI SDK LanguageModelV2 provider for MCP (Model Context Protocol) servers with
sampling capabilities.

## Overview

This package provides an AI SDK LanguageModelV2 provider that allows you to use
MCP servers with sampling capabilities through the
[AI SDK](https://ai-sdk.dev/)'s standard provider interface. This enables you to
leverage AI SDK's agent capabilities with MCP servers.

## Benefits

- **LanguageModelV2 Support**: Uses the latest AI SDK v2 specification
- **Direct Server Integration**: Works directly with MCP Server instances
- **Standardized interface**: Work with MCP through the familiar AI SDK provider
  pattern
- **MCP sampling integration**: Leverage MCP's createMessage capabilities for
  agentic workflows
- **Easy migration**: Switch between different LLM providers and MCP servers
  seamlessly

## Installation

```bash
# Using Deno
deno add @mcpc/ai-sdk-mcp-sampling-provider

# Using npm
npm install @mcpc/ai-sdk-mcp-sampling-provider
```

## Usage

### Basic Example with MCPC

```typescript
import { createMCPSamplingProvider } from "@mcpc/ai-sdk-mcp-sampling-provider";
import { generateText } from "ai";
import { mcpc } from "@mcpc/core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Create MCPC server with sampling capability
const server = await mcpc(
  [
    { name: "my-agent", version: "1.0.0" },
    { capabilities: { tools: {}, sampling: {} } },
  ],
  [
    {
      name: "my-agent",
      description: "An agent that uses tools",
      options: { sampling: true },
    },
  ],
);

// Create provider from server
const provider = createMCPSamplingProvider({
  server: server,
});

// Use with AI SDK
const result = await generateText({
  model: provider.languageModel("my-agent"),
  prompt: "What can you help me with?",
});

console.log(result.text);
```

### Using with Standard MCP Server

```typescript
import { createMCPSamplingProvider } from "@mcpc/ai-sdk-mcp-sampling-provider";
import { generateText } from "ai";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Create MCPC server with agentic tools
const server = await mcpc(
  [{
    name: "my-agent-server",
    version: "1.0.0",
  }, {
    capabilities: {

// Create MCP server with sampling capability
const server = await mcpc(
  [
    { name: "file-processor", version: "1.0.0" },
    {
      capabilities: {
        tools: {},
        sampling: {},
      },
    },
  ],
  [
    {
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
        sampling: true,
      },
    },
  ],
);

// Create provider from server
const provider = createMCPSamplingProvider({
  server: server,
});

// Use with AI SDK
const result = await generateText({
  model: provider.languageModel("file-processor"),
  prompt: "Read the contents of package.json",
});
```

### Streaming

```typescript
import { streamText } from "ai";

const result = await streamText({
  model: provider.languageModel("my-agent"),
  prompt: "Tell me a story",
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

**Note**: MCP createMessage doesn't natively support streaming, so the
implementation returns the full response as a single chunk. True streaming
support would require server-side implementation.

## API Reference

### `createMCPSamplingProvider(config: MCPProviderConfig): MCPProvider`

Creates an MCP sampling provider instance.

**Parameters:**

- `config.server` - MCP Server instance with sampling capability (via
  `createMessage`)
- `config.modelId` - Optional default model ID
- `config.headers` - Optional headers for requests
- `config.baseUrl` - Optional base URL for display purposes

**Returns:** An `MCPProvider` instance with `languageModel()` and `call()`
methods.

### `createSamplingProvider(config: MCPProviderConfig): (modelId: string) => LanguageModelV2`

Creates a function that directly returns language models (convenient shorthand).

**Parameters:** Same as `createMCPSamplingProvider`

**Returns:** A function that takes a `modelId` and returns a `LanguageModelV2`
instance. **Returns:** MCPProvider instance

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
