# @mcpc/mcp-sampling-ai-provider

AI SDK provider that enables MCP servers to act as language models through the
[AI SDK](https://ai-sdk.dev/) interface.

## Overview

This package bridges MCP servers with AI SDK by implementing the LanguageModelV2
interface. It allows any MCP server with sampling capabilities to be used as a
language model in AI SDK applications.

## Installation

```bash
# deno
deno add jsr:@mcpc/mcp-sampling-ai-provider

# npm (from jsr)
npx jsr add @mcpc/mcp-sampling-ai-provider

# pnpm (from jsr)
pnpm add jsr:@mcpc/mcp-sampling-ai-provider
```

## Usage

### Basic Example

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createMCPSamplingProvider } from "@mcpc/mcp-sampling-ai-provider";
import { generateText } from "ai";

// Create MCP server with sampling capability
const server = new Server(
  { name: "my-agent", version: "1.0.0" },
  { capabilities: { sampling: {}, tools: {} } },
);

// Register tools
server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {
      name: "greet",
      description: "Generate a greeting",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "greet") {
    return {
      content: [{ type: "text", text: "Hello from MCP!" }],
    };
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

// Create AI SDK provider from MCP server
const provider = createMCPSamplingProvider({ server });

// Use with AI SDK
const result = await generateText({
  model: provider.languageModel("copilot/gpt-4"),
  prompt: "Say hello",
});

console.log(result.text);
```

### Streaming Example

```typescript
import { streamText } from "ai";

const result = streamText({
  model: provider.languageModel("copilot/gpt-4"),
  prompt: "Write a short story",
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

### Object Generation Example

```typescript
import { generateObject } from "ai";
import { z } from "zod";

const result = await generateObject({
  model: provider.languageModel("copilot/gpt-4"),
  schema: z.object({
    name: z.string(),
    age: z.number(),
  }),
  prompt: "Generate a person's information",
});

console.log(result.object);
```

## API

### `createMCPSamplingProvider(config)`

Creates an MCP sampling provider for use with AI SDK.

**Parameters:**

- `config.server` - MCP Server instance with sampling capability
- `config.modelId` - (Optional) Default model ID
- `config.headers` - (Optional) Request headers
- `config.baseUrl` - (Optional) Base URL for display

**Returns:** Provider with `languageModel(modelId)` method

### `provider.languageModel(modelId)`

Returns a LanguageModelV2 instance for the specified model.

**Parameters:**

- `modelId` - Model identifier (e.g., "copilot/gpt-4")

**Returns:** LanguageModelV2 compatible with AI SDK

## How It Works

1. Converts AI SDK messages to MCP `sampling/createMessage` format
2. Calls MCP server's sampling endpoint
3. Converts MCP response back to AI SDK format
4. Maps stop reasons between protocols

## Limitations

- **Token counting**: MCP doesn't provide token counts (returns 0)
- **Native streaming**: MCP sampling returns complete responses
- **Tool calls**: Experimental support, under development

## Related

- [AI SDK](https://ai-sdk.dev/)
- [MCP Specification](https://modelcontextprotocol.io/)
- [MCPC Framework](https://github.com/mcpc-tech/mcpc)

## License

MIT
