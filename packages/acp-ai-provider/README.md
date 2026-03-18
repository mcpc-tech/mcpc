# @mcpc/acp-ai-provider

[![NPM Version](https://img.shields.io/npm/v/@mcpc-tech/acp-ai-provider)](https://www.npmjs.com/package/@mcpc-tech/acp-ai-provider)
[![JSR](https://jsr.io/badges/@mcpc/acp-ai-provider)](https://jsr.io/@mcpc/acp-ai-provider)

Use [ACP (Agent Client Protocol)](https://agentclientprotocol.com/) agents with
the [AI SDK](https://ai-sdk.dev/).

![acp-demo](./examples/acp-demo.gif)

This package bridges ACP agents to the AI SDK. It spawns ACP agents (Claude
Code, Gemini, Codex CLI, and more) as child processes and exposes them through
the AI SDK's `LanguageModelV2` protocol.

[Try a full stack web ACP example here](https://github.com/mcpc-tech/dev-inspector-mcp)

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
  tools: provider.tools,
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
  tools: provider.tools,
});

for await (const chunk of textStream) {
  process.stdout.write(chunk);
}
```

### Authentication (Lazy by Default)

Authentication is **lazy** by default: the provider does not authenticate during
`initialize`. If an ACP request fails with an auth-required error, the provider
will:

1. call `authenticate(authMethodId)`
2. retry the request **once**

By default, if `authMethodId` is not set and `initialize.authMethods` is
available, the provider will use the first method and print a warning.

To explicitly control this flow, set `authMethodId`:

```typescript
const provider = createACPProvider({
  command: "codebuddy",
  args: ["--acp"],
  authMethodId: process.env.AUTH_METHOD_ID ?? "iOA",
  session: { cwd: process.cwd(), mcpServers: [] },
});
```

You can also authenticate manually:

```typescript
await provider.authenticate("iOA");
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
  tools: provider.tools,
});
```

### Dynamic Host-Side Tools (Experimental)

You can also define AI SDK-style tools that execute on the host side using
`acpTools()`:

```typescript
import { acpTools, createACPProvider } from "@mcpc/acp-ai-provider";
import { streamText, tool } from "ai";
import { z } from "zod";

const provider = createACPProvider({
  command: "claude-code-acp",
  session: { cwd: process.cwd(), mcpServers: [] },
});

const result = await streamText({
  model: provider.languageModel(),
  prompt: "Please greet Alice",
  // acpTools() registers host-side tools for the agent to call
  tools: acpTools({
    greet: tool({
      description: "Greet a person by name",
      inputSchema: z.object({
        name: z.string().describe("The name of the person to greet"),
      }),
      execute: async ({ name }) => `Hello, ${name}!`,
    }),
  }),
});
```

#### How It Works (TCP Socket Callback)

Since ACP agents spawn their own MCP server subprocesses, we use a TCP socket
for the runtime to call back to the host for tool execution:

```
┌─────────────────────────────────────────────────────────┐
│  Host Process                                           │
│    - Starts TCP server (random port)                    │
│    - Passes TCP port via env vars to ACP                │
│                         ▲    │                          │
│                         │    │ TCP (getTools → definitions)
│                         │    │ TCP (callHandler → execute)
│                         │    │                          │
└─────────────────────────┼────┼──────────────────────────┘
                          │    │
┌─────────────────────────┼────┼──────────────────────────┐
│  ACP Agent spawns tool-proxy-runtime                    │
│    - Reads port from ACP_TOOL_PROXY_PORT env            │
│    - Connects and requests tools via `getTools`         │
│    - On MCP tools/call → TCP callHandler → result       │
└─────────────────────────────────────────────────────────┘
```

### Session Persistence

Keep sessions alive for multi-turn conversations:

```typescript
const provider = createACPProvider({
  command: "gemini",
  args: ["--experimental-acp"],
  session: { cwd: process.cwd(), mcpServers: [] },
  persistSession: true, // Keep session alive
});

const model = provider.languageModel();
await generateText({ model, prompt: "Hi, my name is Alice" });
await generateText({ model, prompt: "What's my name?" }); // Agent remembers

provider.cleanup(); // Clean up when done
```

Resume a previous session:

```typescript
const provider = createACPProvider({
  command: "gemini",
  args: ["--experimental-acp"],
  session: { cwd: process.cwd(), mcpServers: [] },
  existingSessionId: "previous-session-id",
  persistSession: true,
});
```

### Selecting Models and Modes

Some ACP agents support multiple models or modes. Use `initSession()` to
discover and select them (or simply provide an arbitrary value to get an error
message listing available options):

```typescript
const provider = createACPProvider({
  command: "claude-code-acp",
  args: [],
  session: { cwd: process.cwd(), mcpServers: [] },
  persistSession: true,
});

// Initialize and get available options
const session = await provider.initSession();

// Check available modes (e.g., "default", "acceptEdits", "plan")
console.log(session.modes?.availableModes);

// Check available models (e.g. "default", "opus", "haiku")
console.log(session.models?.availableModels);

// Now use the model
const result = await generateText({
  // You can optionally specify the model ID here
  model: provider.languageModel("opus", "plan"),
  prompt: "...",
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
  tools: provider.tools,
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

You can import this constant using `ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME`.

### Raw stream parts (plan, diffs, terminals)

The provider emits additional data as `raw` stream parts.

> **Important**: You must set `includeRawChunks: true` to receive raw stream
> parts, otherwise they will be filtered out by the AI SDK.

You can handle them directly in the stream:

```ts
const { fullStream } = streamText({
  includeRawChunks: true, // Required to receive raw parts
  model: provider.languageModel(),
  prompt: "...",
});

for await (const chunk of fullStream) {
  if (chunk.type === "raw") {
    const data = JSON.parse(chunk.rawValue);

    switch (data.type) {
      case "plan":
        // Plan steps: data.entries
        break;
      case "diff":
        // File changes: data.path, data.oldText, data.newText, data.toolCallId
        break;
      case "terminal":
        // Terminal output: data.terminalId, data.toolCallId
        break;
    }
  }
}
```

Or use `messageMetadata` to attach them to messages when streaming to UI:

```ts
const result = streamText({
  includeRawChunks: true, // Required to receive raw parts
  model: provider.languageModel(),
  prompt: "...",
});

const response = result.toUIMessageStreamResponse({
  messageMetadata: ({ part }) => {
    // Convert raw parts to metadata for easier UI access
    if (part.type === "raw" && part.rawValue) {
      const data = JSON.parse(part.rawValue as string);
      switch (data.type) {
        case "plan":
          return { plan: data.entries };
        case "diff":
          return { diffs: [data] }; // Accumulate multiple diffs
        case "terminal":
          return { terminals: [data] }; // Accumulate terminal outputs
      }
    }
  },
});

// In your UI component:
// message.metadata?.plan → plan entries
// message.metadata?.diffs → file changes
// message.metadata?.terminals → terminal outputs
```

## Performance Optimization

<details>
<summary><strong>Performance ⚡️</strong></summary>

For the best user experience, we recommend **pre-initializing the session** with
your tools. Benchmarking shows this can reduce the Time to First Token (TTFT) by
over 60%.

| Strategy            | Connect Time | TTFT (Perceived) |
| ------------------- | ------------ | ---------------- |
| Standard (Lazy)     | N/A          | ~7.3s            |
| **Pre-Initialized** | ~2.3s        | **~2.8s**        |

```typescript
// 1. Create provider and tools
const provider = createACPProvider({/* ... */});
const tools = acpTools({/* ... */});

try {
  // 2. Pre-initialize to warm up connection (saves ~5s)
  await provider.initSession(tools);

  // 3. Use in streamText (instant start)
  await streamText({
    model: provider.languageModel("model-id"),
    tools, // Must use same tools instance
    prompt: "Hello",
  });
} finally {
  provider.cleanup();
}
```

</details>

## Limitations

- **No token counting** — ACP doesn't provide token usage information (it always
  returns 0).
- **Dynamic tools are experimental** — The `tools` parameter uses TCP callback
  which adds some complexity.

## Related

- [AI SDK](https://ai-sdk.dev/)
- [ACP Specification](https://agentclientprotocol.com/overview/introduction)

## License

MIT
