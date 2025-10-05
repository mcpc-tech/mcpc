# Direct Server Integration

When your MCPC server and LLM requests run in the same process, you can use the
server instance directly without going through the MCP transport layer. This
approach is more efficient and provides better type safety.

## Overview

Instead of connecting through stdio/HTTP/SSE transports, you can directly access
the MCPC server's tools and convert them to AI SDK compatible tools manually.
This avoids the overhead of MCP protocol serialization/deserialization.

## Prerequisites

Install the required dependencies:

```bash
# Install AI SDK
npm install ai @ai-sdk/openai

# Install MCPC (choose one)
npx jsr add @mcpc/core       # from JSR
npm install @mcpc-tech/core  # from npm
```

## Direct Integration Pattern

### Tool Conversion Helper

MCPC Core provides a built-in helper function to convert MCPC server tools to AI
SDK format:

```typescript
import { generateText, jsonSchema, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { convertToAISDKTools, mcpc } from "@mcpc/core";

// Create MCPC server
const server = await mcpc(
  [
    { name: "my-agent", version: "1.0.0" },
    { capabilities: { tools: {} } },
  ],
  [
    {
      name: "file-assistant",
      description: `I can help with file operations.
      
Available tools:
<tool name="desktop-commander.list_directory"/>
<tool name="desktop-commander.read_file"/>`,
      options: { mode: "agentic" },
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

// Convert MCPC tools to AI SDK format
const tools = convertToAISDKTools(server, tool, jsonSchema);

// Use with AI SDK
const result = await generateText({
  model: openai("gpt-4"),
  tools,
  maxSteps: 5,
  prompt: "List the files in the current directory",
});

console.log(result.text);
```

### Advanced: Manual Conversion

For advanced use cases where you need custom tool conversion logic, you can
manually convert tools instead of using `convertToAISDKTools`:

```typescript
import { jsonSchema, tool } from "ai";
import type { ComposableMCPServer } from "@mcpc/core";

/**
 * Custom tool conversion with additional logic
 */
function customConvertMCPCTools(server: ComposableMCPServer) {
  const mcpcTools = server.getPublicTools();

  return Object.fromEntries(
    mcpcTools
      .filter((mcpcTool) => {
        // Custom filtering logic
        return !mcpcTool.name.includes("internal");
      })
      .map((mcpcTool) => [
        mcpcTool.name,
        tool({
          description: mcpcTool.description || "No description",
          parameters: jsonSchema(mcpcTool.inputSchema) as any,
          execute: async (input) => {
            // Custom pre-processing
            console.log(`Calling tool: ${mcpcTool.name}`);

            // Call the MCPC server's tool
            const result = await server.callTool(mcpcTool.name, input);

            // Custom post-processing
            return result;
          },
        }),
      ]),
  );
}
```

This allows you to:

- Filter which tools to expose
- Add logging or monitoring
- Transform input/output data
- Add custom error handling

### Basic Setup

Create your MCPC server and convert its tools to AI SDK format using the
built-in helper:

```typescript
import { convertToAISDKTools, mcpc } from "@mcpc/core";
import { generateText, jsonSchema, tool } from "ai";
import { openai } from "@ai-sdk/openai";

// Create MCPC server (without transport connection)
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

// Convert MCPC tools to AI SDK format using the built-in helper
const tools = convertToAISDKTools(server, tool, jsonSchema);

// Use directly with AI SDK
const result = await generateText({
  model: openai("gpt-4o"),
  tools,
  prompt: "List all files in the current directory and analyze their contents",
  maxSteps: 5,
});

console.log(result.text);
```

### Complete Example

Here's a full working example:

```typescript
// app.ts
import { convertToAISDKTools, mcpc } from "@mcpc/core";
import { generateText, jsonSchema, tool } from "ai";
import { openai } from "@ai-sdk/openai";

async function main() {
  // Initialize MCPC server
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
        description:
          `You are a coding assistant that helps with file operations.

Available tools:
<tool name="desktop-commander.read_file"/>
<tool name="desktop-commander.write_file"/>
<tool name="desktop-commander.list_directory"/>
<tool name="desktop-commander.edit_block"/>`,
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

  try {
    // Convert MCPC tools to AI SDK format using the built-in helper
    const tools = convertToAISDKTools(server, tool, jsonSchema);

    // Generate text with tool calling
    const result = await generateText({
      model: openai("gpt-4o"),
      tools,
      prompt: "Analyze the project structure and create a summary document",
      maxSteps: 5,
    });

    console.log("Result:", result.text);
    console.log("Steps taken:", result.steps.length);

    // Access tool call results
    for (const step of result.steps) {
      if (step.toolCalls) {
        for (const toolCall of step.toolCalls) {
          console.log(`Tool: ${toolCall.toolName}`);
          console.log(`Args:`, toolCall.args);
          console.log(`Result:`, toolCall.result);
        }
      }
    }
  } finally {
    // Clean up server resources
    await server.close();
  }
}

main().catch(console.error);
```

### Streaming Example

You can also use streaming with direct server integration:

```typescript
import { convertToAISDKTools, mcpc } from "@mcpc/core";
import { jsonSchema, streamText, tool } from "ai";
import { openai } from "@ai-sdk/openai";

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
      description: `Your agent description here...`,
      options: { mode: "agentic" },
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

// Convert MCPC tools to AI SDK format using the built-in helper
const tools = convertToAISDKTools(server, tool, jsonSchema);

const result = streamText({
  model: openai("gpt-4o"),
  tools,
  prompt: "Refactor the codebase to improve performance",
  onFinish: async () => {
    await server.close();
  },
});

// Stream the response
for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

## Benefits of Direct Integration

1. **Better Performance**: No network/IPC overhead from transport layer
2. **Type Safety**: Direct access to TypeScript types from your MCPC server
3. **Simpler Setup**: No need to manage separate processes or HTTP servers
4. **Easier Debugging**: All code runs in the same process
5. **Immediate Availability**: No connection establishment delay

## When to Use Direct Integration

Use direct server integration when:

- Your MCPC server and LLM requests run in the same Node.js process
- You're building a standalone application (CLI tools, scripts, etc.)
- You want the simplest possible setup
- Performance is critical

Use transport-based integration when:

- Your MCPC server runs as a separate service
- You need to share the server across multiple clients
- You're integrating with external AI clients (VS Code, Claude Desktop, etc.)
- You need language-agnostic access to your tools

## Next.js API Routes Example

Direct integration works great with Next.js API routes:

```typescript
// app/api/agent/route.ts
import { convertToAISDKTools, mcpc } from "@mcpc/core";
import { jsonSchema, streamText, tool } from "ai";
import { openai } from "@ai-sdk/openai";

export async function POST(req: Request) {
  const { prompt } = await req.json();

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
        description: `Your agent description...`,
        options: { mode: "agentic" },
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

  // Convert MCPC tools to AI SDK format using the built-in helper
  const tools = convertToAISDKTools(server, tool, jsonSchema);

  const result = streamText({
    model: openai("gpt-4o"),
    tools,
    prompt,
    onFinish: async () => {
      await server.close();
    },
  });

  return result.toDataStreamResponse();
}
```

## Error Handling

Always ensure proper cleanup:

```typescript
import { mcpc, convertToAISDKTools } from "@mcpc/core";
import { generateText, tool, jsonSchema } from "ai";
import { openai } from "@ai-sdk/openai";

let server;

try {
  server = await mcpc([...], [...]);
  
  // Convert tools using the built-in helper
  const tools = convertToAISDKTools(server, tool, jsonSchema);
  
  const result = await generateText({
    model: openai('gpt-4o'),
    tools,
    prompt: 'Your prompt here',
  });
  
  return result;
} catch (error) {
  console.error('MCPC Error:', error);
  throw error;
} finally {
  await server?.close();
}
```

## Additional Resources

- [AI SDK Integration (Transport-based)](./ai-sdk-integration.md)
- [Create Your First Agentic MCP](./create-your-first-agentic-mcp.md)
- [AI SDK Documentation](https://ai-sdk.dev/docs)
