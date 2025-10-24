# @mcpc/acp-ai-provider

[![NPM Version](https://img.shields.io/npm/v/@mcpc-tech/acp-ai-provider)](https://www.npmjs.com/package/@mcpc-tech/acp-ai-provider)
[![JSR](https://jsr.io/badges/@mcpc/acp-ai-provider)](https://jsr.io/@mcpc/acp-ai-provider)

Use [ACP (Agent Client Protocol)](https://agentclientprotocol.com/) agents with
the [AI SDK](https://ai-sdk.dev/).

![acp-demo](./examples/acp-demo.gif)

This package bridges ACP agents to the AI SDK. It spawns ACP agents (Claude
Code, Gemini, Codex CLI, and more) as child processes and exposes them through
the AI SDK's `LanguageModelV2` protocol.

## Installation

```bash
# npm
npm i @mcpc-tech/acp-ai-provider

# deno
deno add jsr:@mcpc/acp-ai-provider
```

## Usage

[See all examples](https://github.com/mcpc-tech/mcpc/tree/main/packages/acp-ai-provider/examples)

### Basic Example

```typescript
import { createACPProvider } from "@mcpc/acp-ai-provider";
import { generateText } from "ai";
import process from "node:process";

// Create provider for an ACP agent
const provider = createACPProvider({
  command: "gemini",
  args: ["--experimental-acp"],
  session: {
    cwd: process.cwd(),
    mcpServers: [],
  },
});

// Use with AI SDK
const result = await generateText({
  model: provider.languageModel(),
  prompt: "Hello, what can you help me with?",
});

console.log(result.text);
```

### Streaming Example

```typescript
import { createACPProvider } from "@mcpc/acp-ai-provider";
import { streamText } from "ai";
import process from "node:process";

const provider = createACPProvider({
  command: "claude-code-acp",
  args: [],
  session: {
    cwd: process.cwd(),
    mcpServers: [],
  },
});

const { textStream } = streamText({
  model: provider.languageModel(),
  prompt: "Write a simple Hello World program",
});

for await (const chunk of textStream) {
  process.stdout.write(chunk);
}
```

### With Tools (MCP Servers)

Tools are defined through MCP (Model Context Protocol) servers, not AI SDK's
`tools` parameter:

```typescript
const provider = createACPProvider({
  command: "gemini",
  args: ["--experimental-acp"],
  session: {
    cwd: process.cwd(),
    mcpServers: [
      {
        type: "stdio",
        name: "filesystem",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      },
    ],
  },
});

const result = await generateText({
  model: provider.languageModel(),
  prompt: "List files in /tmp",
});
```

## FAQ

### How to stream tool calls

Tools are passed to the AI SDK as
[provider-defined tools](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool#tool.tool.type)
because they are called and executed by the ACP agent (for example, Codex).

So, to stream tool calls, pass the provider tools to the AI SDK:

```ts
const result = await generateText({
  model: provider.languageModel(),
  prompt: "List files in /tmp",
  tools: provider.tools(),
});
```

The actual tool name and arguments live inside
`acp.acp_provider_agent_dynamic_tool`'s input and follow this structure:

```ts
export const providerAgentDynamicToolSchema = z.object({
  toolCallId: z.string().describe("The unique ID of the tool call."),
  toolName: z.string().describe("The name of the tool being called."),
  args: z.record(z.any()).describe("The input arguments for the tool call."),
});
```

## Limitations

- **No AI SDK tools support** — Tools must be defined through MCP servers in
  `session.mcpServers`, not via the AI SDK's `tools` parameter.
- **No token counting** — ACP doesn't provide token usage information (it always
  returns 0).

## Related

- [AI SDK](https://ai-sdk.dev/)
- [ACP Specification](https://agentclientprotocol.com/overview/introduction)

## License

MIT
