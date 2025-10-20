# @mcpc/acp-ai-provider

Use [ACP (Agent Client Protocol)](https://agentclientprotocol.com/) agents with
the [AI SDK](https://ai-sdk.dev/).

This package bridges ACP agents to the AI SDK. It spawns ACP agents(Claude Code,
Gemini, Codex CLI,
[More](https://github.com/agentclientprotocol/agent-client-protocol?tab=readme-ov-file#agents))
as child processes and exposes them through AI SDK's `LanguageModelV2`
interface.

## Installation

```bash
# npm
npm i @mcpc-tech/acp-ai-provider

# deno
deno add jsr:@mcpc/acp-ai-provider
```

## Usage

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

## API

### createACPProvider(config)

**Parameters:**

- `command` (string) - Command to spawn the agent (e.g., `"gemini"`,
  `"claude-code"`)
- `args` (string[], optional) - Arguments to pass to the agent
- `env` (object, optional) - Environment variables for the agent process
- `session` (object, required) - Session configuration
  - `cwd` (string) - Working directory
  - `mcpServers` (array) - MCP server configurations
- `initialize` (object, optional) - Initialize configuration

**Returns:** Provider instance with `languageModel()` method

### provider.languageModel()

**Returns:** LanguageModelV2 instance compatible with AI SDK functions
(`generateText`, `streamText`, etc.)

**Note:** Does not accept parameters. Configure the agent via `command`, `args`,
and `mcpServers` instead.

## Limitations

- **No AI SDK tools support**: Tools must be defined through MCP servers in
  `session.mcpServers`, not via AI SDK's `tools` parameter
- **No token counting**: MCP doesn't provide token usage (returns 0)

## Related

- [AI SDK](https://ai-sdk.dev/)
- [ACP Specification](https://agentclientprotocol.com/overview/introduction)

## License

MIT
