/**
 * MCPC Example 13: In-Memory Transport
 *
 * Demonstrates the in-memory transport feature:
 * - Using InMemoryTransport for in-process communication
 * - Useful for testing and embedding MCP servers
 * - No external process spawning required
 *
 * This creates a file manager that communicates with an embedded MCP server
 * via in-memory transport, perfect for testing and integration scenarios.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ComposeDefinition, mcpc } from "../mod.ts";

// Create a simple in-memory MCP server for demonstration
function createTestMcpServer() {
  const mcpServer = new McpServer({
    name: "test-memory-server",
    version: "1.0.0",
  });

  // Register a simple tool
  mcpServer.tool(
    "greet",
    "Greet a user by name",
    { name: "string" },
    ({ name }) => ({
      content: [{
        type: "text" as const,
        text:
          `Hello, ${name}! This message comes from an in-memory MCP server.`,
      }],
    }),
  );

  return mcpServer;
}

// Initialize the in-memory server
const testServer = createTestMcpServer();

export const toolDefinitions: ComposeDefinition[] = [
  {
    name: "memory-agent",
    description:
      `I am an agent that uses in-memory transport to communicate with MCP servers.

Available tools:
<tool name="test-memory-server.greet"/>

I can greet users using the in-memory MCP server. This demonstrates how MCPC can work with 
in-memory transports for testing and embedded scenarios where you don't want to spawn 
external processes.`,

    deps: {
      mcpServers: {
        "test-memory-server": {
          transportType: "memory" as const,
          server: testServer,
        },
      },
    },
  },
];

export const server = await mcpc(
  [
    {
      name: "in-memory-example",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {
          listChanged: true,
        },
      },
    },
  ],
  toolDefinitions,
);

// Only run if executed directly
if (import.meta.main) {
  console.log("Starting In-Memory Transport Example Server...");
  console.log("\nThis example demonstrates in-memory transport:");
  console.log("- No external processes spawned");
  console.log("- Useful for testing and embedding");
  console.log("- Fast and efficient for in-process communication\n");

  await server.connect(new StdioServerTransport());
  console.log("Server running with in-memory transport support!");
}
