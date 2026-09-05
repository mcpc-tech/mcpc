# @mcpc/acp-ai-provider

[![NPM Version](https://img.shields.io/npm/v/@mcpc-tech/acp-ai-provider)](https://www.npmjs.com/package/@mcpc-tech/acp-ai-provider)
[![JSR](https://jsr.io/badges/@mcpc/acp-ai-provider)](https://jsr.io/@mcpc/acp-ai-provider)

> **Version Compatibility**
>
> - `v0.2.x` requires **AI SDK v6**
>   ([`main`](https://github.com/mcpc-tech/mcpc/tree/main/packages/acp-ai-provider)
>   branch)
> - For **AI SDK v5**, use the
>   [`release-v5`](https://github.com/mcpc-tech/mcpc/tree/release-v5/packages/acp-ai-provider)
>   branch or install `@mcpc-tech/acp-ai-provider@ai-v5`

Use [ACP (Agent Client Protocol)](https://agentclientprotocol.com/) agents with
the [AI SDK](https://ai-sdk.dev/).

![acp-demo](./examples/acp-demo.gif)

This package bridges ACP agents to the AI SDK. It spawns ACP agents (Claude
Code, Gemini, Codex CLI, and more) as child processes and exposes them through
the AI SDK's `LanguageModelV3`/`LanguageModelV2` protocol.

[Try a full stack web ACP example here](https://github.com/mcpc-tech/dev-inspector-mcp)

## Installation

```bash
# npm
npm i @mcpc-tech/acp-ai-provider

# deno
deno add jsr:@mcpc/acp-ai-provider
```

For **AI SDK v5** users:

```bash
# npm (v5)
npm i @mcpc-tech/acp-ai-provider@ai-v5

# deno (v5)
deno add jsr:@mcpc/acp-ai-provider@0.1
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
  command: "claude-agent-acp",
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

### Structured JSON Output

Use AI SDK's `Output.object()` to get structured JSON from ACP agents. The
provider automatically injects JSON schema instructions into the prompt and
strips markdown fences from the response if needed.

```typescript
import { createACPProvider } from "@mcpc/acp-ai-provider";
import { generateText, Output, streamText } from "ai";
import process from "node:process";
import { z } from "zod";

const provider = createACPProvider({
  command: "gemini",
  args: ["--experimental-acp"],
  session: { cwd: process.cwd(), mcpServers: [] },
});

const result = await generateText({
  model: provider.languageModel(),
  prompt: "Give me a recipe for chocolate chip cookies.",
  output: Output.object({
    schema: z.object({
      name: z.string(),
      ingredients: z.array(z.object({ item: z.string(), amount: z.string() })),
      steps: z.array(z.string()),
    }),
  }),
});

console.log(result.output); // Typed object matching the schema
```

This also works with `streamText`:

```typescript
const stream = streamText({
  model: provider.languageModel(),
  prompt: "Tell me about Tokyo",
  output: Output.object({
    schema: z.object({
      name: z.string(),
      country: z.string(),
      landmarks: z.array(z.string()),
    }),
  }),
});

const output = await stream.output; // Parsed object
```

> **How it works**: When `Output.object()` (or `Output.array()`,
> `Output.json()`, `Output.choice()`) is used, AI SDK sets
> `responseFormat.type = "json"` with an optional JSON Schema. The ACP provider
> detects this and:
>
> 1. Prepends a structured-output instruction (with the schema) to the prompt
> 2. Strips markdown code fences from the response (in both generate and stream
>    modes)
> 3. Passes clean JSON text to AI SDK for validation and parsing

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
  command: "gemini",
  args: ["--experimental-acp"],
  authMethodId: process.env.AUTH_METHOD_ID,
  session: { cwd: process.cwd(), mcpServers: [] },
});
```

You can also authenticate manually:

```typescript
await provider.authenticate(process.env.AUTH_METHOD_ID);
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
  command: "claude-agent-acp",
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

#### Tool Result Format

By default, tools can return simple values like strings or objects:

```typescript
execute: async ({ name }) => `Hello, ${name}!`,
execute: async () => ({ status: "ok" }),
```

These are automatically wrapped into the MCP `CallToolResult` format with a
`text` content block.

However, for tools that return rich content like images or audio, you should
return the MCP
[`CallToolResult`](https://spec.modelcontextprotocol.io/specification/2025-03-26/server/tools/#tool-result)
format directly:

```typescript
execute: async ({ url }) => {
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    content: [
      {
        type: "text" as const,
        text: `Fetched image from ${url}`,
      },
      {
        type: "image" as const,
        data: buffer.toString("base64"),
        mimeType: response.headers.get("content-type") || "image/jpeg",
      },
    ],
  };
},
```

**Why?** Under the hood, `acpTools()` are implemented as MCP tools. Simple
returns get wrapped as `{ content: [{ type: "text", text: ... }] }`. If you
return an object with `image` or `audio` blocks without the MCP wrapper, those
media blocks get JSON-stringified into a text block and lost. By returning the
MCP `CallToolResult` format explicitly, the media data is preserved and sent to
the agent as proper MCP content blocks.

See [image-tool-result-example.ts](./examples/image-tool-result-example.ts) for
a complete working example.

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

### Session Management

> **Key Difference**: ACP providers maintain **stateful sessions** across
> multiple requests, while `streamText` itself is **stateless**. Each
> `streamText` call is independent, but the underlying ACP agent process can
> persist conversation context when properly managed.

#### Simple Session Persistence (Single Provider)

For simple use cases, use `persistSession` to keep the same provider alive:

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

#### Multi-Session Management (Server/API Pattern)

For server applications handling multiple concurrent users, manage sessions in a
Map:

```typescript
interface SessionEntry {
  provider: ReturnType<typeof createACPProvider>;
  createdAt: number;
}

const sessionProviders = new Map<string, SessionEntry>();

// Initialize a new session
async function initSession(agentCommand: string): Promise<string> {
  const provider = createACPProvider({
    command: agentCommand,
    args: [],
    session: { cwd: process.cwd(), mcpServers: [] },
    persistSession: true,
  });

  const session = await provider.initSession();
  const sessionId = session.sessionId;

  sessionProviders.set(sessionId, { provider, createdAt: Date.now() });
  return sessionId;
}

// Use existing session
async function chat(sessionId: string, prompt: string) {
  const entry = sessionProviders.get(sessionId);
  if (!entry) throw new Error("Session not found");

  const { textStream } = streamText({
    model: entry.provider.languageModel(),
    prompt,
    tools: entry.provider.tools,
  });

  // Stream response...
}

// Cleanup session
function cleanupSession(sessionId: string) {
  const entry = sessionProviders.get(sessionId);
  if (entry) {
    entry.provider.cleanup();
    sessionProviders.delete(sessionId);
  }
}
```

See [session-management-example.ts](./examples/session-management-example.ts)
for a complete working example.

### Selecting Models, Modes, and Session Config Options

Some ACP agents support multiple models, modes, or general session config
options. Use `initSession()` to discover what the current agent advertises.
Config IDs and values are agent-defined, so do not assume that the same ID is
used by every agent.

```typescript
const provider = createACPProvider({
  command: "claude-agent-acp",
  args: [],
  session: { cwd: process.cwd(), mcpServers: [] },
  persistSession: true,
});

// Initialize and get available options
const session = await provider.initSession();

// Existing model/mode APIs remain supported.
console.log(session.modes?.availableModes);
console.log(session.models?.availableModels);
await provider.setMode("plan");
await provider.setModel("opus");

// Inspect arbitrary options advertised by this agent.
console.log(session.configOptions);
console.log(provider.getConfigOptions("thought_level"));

// Set an option using its advertised ID and value.
const option = session.configOptions?.find((item) =>
  item.category === "thought_level"
);
if (option) {
  await provider.setConfigOption(option.id, "high");
}

// Or resolve the option by semantic category without hard-coding its ID.
await provider.setThoughtLevel("high");
await provider.setConfigOptionByCategory("model_config", "balanced");

const result = await generateText({
  model: provider.languageModel(),
  prompt: "...",
});
```

`setConfigOption()` returns the ACP `SetSessionConfigOptionResponse`. The
provider caches its returned `configOptions`, because changing one option may
change the available values or state of other options. `getConfigOptions()`
therefore reflects the latest successful update for the provider's active
session.

`setConfigOptionByCategory()` and `setThoughtLevel()` only select an option when
exactly one advertised option has that category. They throw when none or
multiple match; in the multiple-match case, inspect `getConfigOptions(category)`
and call `setConfigOption()` with the intended ID. Unknown custom categories are
supported.

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

## Debugging

Set the `ACP_AI_PROVIDER_DEBUG` environment variable to enable debug logging:

```bash
# Enable debug logging
export ACP_AI_PROVIDER_DEBUG=1

# Run your script
npx tsx example.ts
```

When enabled, raw ACP messages are logged to a temporary file:

```
[acp-ai-provider] Agent message log: /tmp/acp-ai-provider-xxx/agent-messages.ndjson
```

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
