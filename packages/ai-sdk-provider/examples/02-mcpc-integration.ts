/**
 * Advanced Example: Using MCP Provider with MCPC Agents
 *
 * This example demonstrates how to use the MCP AI SDK provider
 * with MCPC (MCP Composable) agents. It shows how to create
 * an agentic MCP tool and use it through the AI SDK.
 *
 * This approach allows you to leverage AI SDK's features like
 * streaming, tool calling, and multi-turn conversations with
 * MCPC agents.
 *
 * Run: deno run --allow-all examples/02-mcpc-integration.ts
 */

/**
 * In this example, we assume you have an MCPC server running that
 * provides agentic tools with sampling capabilities.
 *
 * The MCPC server would be created like this:
 *
 * ```typescript
 * import { mcpc } from "@mcpc/core";
 *
 * const server = await mcpc(
 *   [{
 *     name: "my-agent-server",
 *     version: "1.0.0",
 *   }, {
 *     capabilities: {
 *       tools: {},
 *       sampling: {},
 *     },
 *   }],
 *   [{
 *     name: "code-analyzer",
 *     description: `Analyze code files and provide insights.
 *
 *       <tool name="filesystem.read_file"/>
 *       <tool name="filesystem.list_directory"/>`,
 *     deps: {
 *       mcpServers: {
 *         filesystem: {
 *           command: "npx",
 *           args: ["-y", "@modelcontextprotocol/server-filesystem"],
 *           transportType: "stdio",
 *         },
 *       },
 *     },
 *     options: {
 *       mode: "agentic",
 *     },
 *   }],
 * );
 * ```
 */

console.log("🚀 MCP AI SDK Provider - MCPC Integration Example\n");
console.log(
  "📝 This is a conceptual example showing how to use AI SDK with MCPC agents.\n",
);
console.log(
  "⚠️  You would need a running MCPC server to actually execute this.\n",
);

// Example 1: Simple text generation with MCPC agent
function exampleSimpleGeneration() {
  console.log("Example 1: Simple Text Generation");
  console.log("=====================================\n");

  // In real usage, you would create a client connected to your MCPC server
  // const client = await connectToMCPCServer();

  // const mcp = createMCPProvider({ client });

  // Use the MCPC agent tool as a model
  // const result = await generateText({
  //   model: mcp("code-analyzer"),
  //   prompt: "Analyze the structure of this TypeScript project",
  // });

  // console.log("Result:", result.text);

  console.log(
    "Code example:\n```typescript\nconst result = await generateText({\n  model: mcp('code-analyzer'),\n  prompt: 'Analyze the structure of this TypeScript project'\n});\n```\n",
  );
}

// Example 2: Streaming responses
function exampleStreaming() {
  console.log("Example 2: Streaming Responses");
  console.log("=====================================\n");

  // const result = await streamText({
  //   model: mcp("code-analyzer"),
  //   prompt: "List all TypeScript files in the src directory",
  // });

  // for await (const chunk of result.textStream) {
  //   process.stdout.write(chunk);
  // }

  console.log(
    "Code example:\n```typescript\nconst result = await streamText({\n  model: mcp('code-analyzer'),\n  prompt: 'List all TypeScript files in the src directory'\n});\n\nfor await (const chunk of result.textStream) {\n  process.stdout.write(chunk);\n}\n```\n",
  );
}

// Example 3: Multi-turn conversation
function exampleConversation() {
  console.log("Example 3: Multi-turn Conversation");
  console.log("=====================================\n");

  // const messages = [
  //   { role: 'user', content: 'Read package.json' },
  //   { role: 'assistant', content: '...' },
  //   { role: 'user', content: 'What dependencies does it have?' },
  // ];

  // const result = await generateText({
  //   model: mcp("code-analyzer"),
  //   messages: messages,
  // });

  console.log(
    "Code example:\n```typescript\nconst messages = [\n  { role: 'user', content: 'Read package.json' },\n  { role: 'assistant', content: '...' },\n  { role: 'user', content: 'What dependencies does it have?' },\n];\n\nconst result = await generateText({\n  model: mcp('code-analyzer'),\n  messages: messages\n});\n```\n",
  );
}

// Example 4: Using system prompts
function exampleSystemPrompt() {
  console.log("Example 4: System Prompts");
  console.log("=====================================\n");

  // const result = await generateText({
  //   model: mcp("code-analyzer"),
  //   system: "You are a security-focused code reviewer. Always check for security vulnerabilities.",
  //   prompt: "Review this authentication code",
  // });

  console.log(
    "Code example:\n```typescript\nconst result = await generateText({\n  model: mcp('code-analyzer'),\n  system: 'You are a security-focused code reviewer.',\n  prompt: 'Review this authentication code'\n});\n```\n",
  );
}

// Run examples
function main() {
  exampleSimpleGeneration();
  console.log("\n");

  exampleStreaming();
  console.log("\n");

  exampleConversation();
  console.log("\n");

  exampleSystemPrompt();
  console.log("\n");

  console.log("✅ Examples completed!\n");
  console.log("💡 Key Benefits:");
  console.log("   - Use AI SDK's familiar API with MCP agents");
  console.log("   - Leverage AI SDK features (streaming, tools, etc.)");
  console.log(
    "   - Seamlessly switch between different providers and MCP servers",
  );
  console.log("   - Build complex agentic workflows with standard interfaces");
}

main();
