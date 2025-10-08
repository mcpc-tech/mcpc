# @mcpc/mcp-sampling-ai-provider

[![NPM Version](https://img.shields.io/npm/v/@mcpc-tech/mcp-sampling-ai-provider)](https://www.npmjs.com/package/@mcpc-tech/mcp-sampling-ai-provider)
[![JSR](https://jsr.io/badges/@mcpc/mcp-sampling-ai-provider)](https://jsr.io/@mcpc/mcp-sampling-ai-provider)

AI SDK provider that enables MCP servers to use AI models through the
[AI SDK](https://ai-sdk.dev/). This effectively transforms your MCP server into
an **agentic tool** that can reason and make decisions, rather than just a
simple connector.

## ⚠️ Prerequisites

This provider has specific requirements:

1. **Must run inside an MCP Server** - This is not a standalone AI SDK provider.
   It works by forwarding requests to the MCP client.
2. **Client must support MCP Sampling** - The connected MCP client must
   implement the
   [sampling capability](https://modelcontextprotocol.io/specification/2025-06-18/client/sampling),
   or you can implement it yourself (see
   [Client Sampling](#client-sampling-for-clients-without-native-support)
   below).

**Clients with sampling support:**

- ✅ **VS Code** (with GitHub Copilot), See the
  [full list](https://modelcontextprotocol.io/clients) for more clients.
- ❌ **Claude Code** -
  [Issue #1785](https://github.com/anthropics/claude-code/issues/1785)
- ❌ **Cursor** - [Issue #3023](https://github.com/cursor/cursor/issues/3023)

- 🔧 **Or implement your own** - Use `setupClientSampling()` to add sampling to
  any MCP client (see example below).

## Overview

This package lets MCP servers call language models through AI SDK's standard
interface. It implements LanguageModelV2 by forwarding requests to MCP's
sampling capability.

## Installation

```bash
# npm
npm i @mcpc-tech/mcp-sampling-ai-provider

# deno
deno add jsr:@mcpc/mcp-sampling-ai-provider
```

## Usage

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createMCPSamplingProvider } from "@mcpc/mcp-sampling-ai-provider";
import { generateText } from "ai";

// Create MCP server with sampling capability
const server = new Server(
  { name: "translator", version: "1.0.0" },
  { capabilities: { sampling: {}, tools: {} } },
);

// Register a translation tool that uses AI
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "translate") {
    // Create provider from the server
    const provider = createMCPSamplingProvider({ server });

    // Use AI SDK to translate text
    const result = await generateText({
      model: provider.languageModel({
        modelPreferences: { hints: [{ name: "gpt-5-mini" }] },
      }),
      prompt:
        `Translate to ${request.params.arguments?.target_lang}: ${request.params.arguments?.text}`,
    });

    return { content: [{ type: "text", text: result.text }] };
  }
});

// Connect and start
const transport = new StdioServerTransport();
await server.connect(transport);
```

See the [examples](./examples/) directory for complete working examples:

- [`generate_text_example.ts`](./examples/generate_text_example.ts) - Basic text
  generation
- [`stream_text_example.ts`](./examples/stream_text_example.ts) - Streaming
  responses
- [`generate_object_example.ts`](./examples/generate_object_example.ts) -
  Structured output

## API

### `createMCPSamplingProvider(config)`

Creates an MCP sampling provider.

**Parameters:**

- `config.server` - MCP Server instance with sampling capability

**Returns:** Provider with `languageModel(options)` method

### `provider.languageModel(options?)`

Creates a language model instance.

**Parameters:**

- `options.modelPreferences` - (Optional) Model preferences for this call
  - `hints` - Array of model name hints (e.g., `[{ name: "gpt-4" }]`)
  - `costPriority` - 0-1, higher prefers cheaper models
  - `speedPriority` - 0-1, higher prefers faster models
  - `intelligencePriority` - 0-1, higher prefers more capable models

**Returns:** LanguageModelV2 compatible with AI SDK

See
[MCP Model Preferences](https://modelcontextprotocol.io/specification/2025-06-18/client/sampling#model-preferences)
for details.

## Client Sampling (for clients without native support)

If your MCP client **doesn't support sampling**, you can add sampling capability
using `setupClientSampling` with model preferences:

```typescript
import {
  convertAISDKFinishReasonToMCP,
  selectModelFromPreferences,
} from "@mcpc/mcp-sampling-ai-provider";

setupClientSampling(client, {
  handler: async (params) => {
    const modelId = selectModelFromPreferences(params.modelPreferences, {
      hints: {
        "gpt-5": "openai/gpt-5-mini",
        "gpt-mini": "openai/gpt-5-mini",
      },
      priorities: {
        speed: "openai/gpt-5-mini",
        intelligence: "openai/gpt-5-mini",
      },
      default: "openai/gpt-5-mini",
    });

    const result = await generateText({
      model: modelId,
      messages: params.messages,
    });

    return {
      model: modelId,
      role: "assistant",
      content: { type: "text", text: result.text },
      stopReason: convertAISDKFinishReasonToMCP(result.finishReason),
    };
  },
});
```

See [`client-sampling-example.ts`](./examples/client-sampling-example.ts) for a
complete example.

## How It Works

Simple request flow:

1. AI SDK calls the language model
2. Provider converts to MCP `sampling/createMessage` format
3. MCP client handles the sampling request
4. Provider converts response back to AI SDK format

The MCP client (e.g., VS Code, Claude Desktop) decides which actual model to use
based on `modelPreferences`.

## Limitations

- **No token counting**: MCP doesn't provide token usage (returns 0)
- **No native streaming**: MCP sampling doesn't support streaming - we call
  `doGenerate` first, then emit the complete response as stream events
- **Experimental tool/json support**: Implemented via systemPrompt as MCP
  sampling doesn't natively support these

## Related

- [AI SDK](https://ai-sdk.dev/)
- [MCP Specification](https://modelcontextprotocol.io/)
- [MCPC Framework](https://github.com/mcpc-tech/mcpc)

## License

MIT
