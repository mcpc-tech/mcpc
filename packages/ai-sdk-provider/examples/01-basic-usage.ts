/**
 * Basic Example: Using MCP Sampling with AI SDK
 *
 * This example demonstrates how to use the MCP AI SDK provider
 * to interact with an MCPC agent through the AI SDK interface.
 *
 * Run: deno run --allow-all examples/01-basic-usage.ts
 */

import { createMCPProvider } from "../mod.ts";
import { generateText } from "ai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

console.log("🚀 MCP AI SDK Provider - Basic Example\n");

// For this example, we'll create a client that connects to an MCP server
// In a real application, you would connect to your MCPC server or any MCP server
// that implements the sampling capability

async function main() {
  console.log("📡 Setting up MCP client...");

  // Create MCP client transport
  // This example uses stdio transport to connect to a local MCP server
  const transport = new StdioClientTransport({
    command: "node",
    args: [
      "-e",
      `
      // Simple echo server for demonstration
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
      
      const server = new Server({
        name: 'echo-server',
        version: '1.0.0'
      }, {
        capabilities: {
          sampling: {}
        }
      });
      
      // Handle sampling requests
      server.setRequestHandler('sampling/createMessage', async (request) => {
        const lastMessage = request.params.messages[request.params.messages.length - 1];
        const userText = lastMessage?.content?.text || 'Hello!';
        
        return {
          role: 'assistant',
          content: {
            type: 'text',
            text: \`Echo: \${userText}\`
          },
          model: 'echo-model',
          stopReason: 'endTurn'
        };
      });
      
      const transport = new StdioServerTransport();
      server.connect(transport).catch(console.error);
      `,
    ],
  });

  // Create MCP client
  const client = new Client(
    {
      name: "ai-sdk-example",
      version: "1.0.0",
    },
    {
      capabilities: {
        sampling: {},
      },
    },
  );

  console.log("🔌 Connecting to MCP server...");
  await client.connect(transport);

  console.log("✅ Connected!\n");

  // Create MCP provider
  console.log("🎯 Creating MCP AI SDK provider...");
  const mcp = createMCPProvider({
    client: client,
  });

  console.log("✅ Provider created!\n");

  // Use with AI SDK - generateText
  console.log("💬 Generating text with AI SDK...");
  const result = await generateText({
    model: mcp.languageModel("echo-model"),
    prompt: "Hello from AI SDK!",
  });

  console.log("\n📝 Result:");
  console.log(result.text);

  console.log("\n📊 Metadata:");
  console.log(`- Finish reason: ${result.finishReason}`);
  console.log(`- Usage: ${JSON.stringify(result.usage)}`);

  // Clean up
  console.log("\n🧹 Cleaning up...");
  await client.close();

  console.log("✅ Done!");
}

// Run the example
main().catch((error) => {
  console.error("❌ Error:", error);
  Deno.exit(1);
});
