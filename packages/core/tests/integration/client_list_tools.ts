/**
 * Client can connect to mcpc servers and list available tools
 */

import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mcpc } from "../../src/set-up-mcp-compose.ts";
import { Client } from "@modelcontextprotocol/sdk/client";
import { assertArrayIncludes, assertEquals } from "@std/assert";

Deno.test("Client list tools - agentic server + public tools", async () => {
  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [
      {
        name: "test-agent",
        description: "Test agent",
        deps: { mcpServers: {} },
      },
    ],
    (server) => {
      // Register a simple tool on the in-memory server
      server.tool<{ message: string }>(
        "echo",
        "Echo input",
        { type: "object", properties: { message: { type: "string" } } },
        (args: { message: string }) => ({
          content: [{ type: "text" as const, text: `Echo: ${args.message}` }],
        }),
      );
    },
  );

  const [clientTransport, serverTransport] = InMemoryTransport
    .createLinkedPair();

  await server.connect(serverTransport);

  const client = new Client({
    name: "test-client",
    version: "1.0.0",
  });

  await client.connect(clientTransport);

  const tools = await client.listTools();
  assertEquals(
    tools.tools.length,
    2,
    "Should have 2 tools registered (agent+public tool)",
  );
});

Deno.test("Client list tools - agentic server + internal", async () => {
  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [
      {
        name: "test-agent",
        description: "Test agent",
        options: {
          refs: ['<tool name="echo"/>'],
        },
        deps: { mcpServers: {} },
      },
    ],
    (server) => {
      // Register a simple tool on the in-memory server
      server.tool<{ message: string }>(
        "echo",
        "Echo input",
        { type: "object", properties: { message: { type: "string" } } },
        (args: { message: string }) => ({
          content: [{ type: "text" as const, text: `Echo: ${args.message}` }],
        }),
        { internal: true },
      );
    },
  );

  const [clientTransport, serverTransport] = InMemoryTransport
    .createLinkedPair();

  await server.connect(serverTransport);

  const client = new Client({
    name: "test-client",
    version: "1.0.0",
  });

  await client.connect(clientTransport);

  const tools = await client.listTools();
  assertEquals(
    tools.tools.length,
    1,
    "Should have 1 tool registered (agent only)",
  );

  assertArrayIncludes(
    (
      tools.tools[0].inputSchema.properties?.action as unknown as {
        enum: string[];
      }
    ).enum,
    ["echo"],
    "Agent tool should include 'echo' in its action enum",
  );
});
