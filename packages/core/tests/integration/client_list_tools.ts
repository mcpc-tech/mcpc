/**
 * Client can connect to mcpc servers and list available tools
 */

import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mcpc } from "../../src/set-up-mcp-compose.ts";
import { Client } from "@modelcontextprotocol/sdk/client";
import { assertArrayIncludes, assertEquals } from "@std/assert";
import { jsonSchema } from "../../src/utils/schema.ts";

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
        {
          internal: false,
          outputSchema: {
            type: "object",
            properties: {
              echoedMessage: { type: "string" },
            },
            required: ["echoedMessage"],
          },
        },
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

  const echoTool = tools.tools.find((tool) => tool.name === "echo");
  assertEquals(echoTool !== undefined, true, "Echo tool should exist");
  assertEquals(
    (echoTool?.outputSchema?.properties?.echoedMessage as { type?: string })
      ?.type,
    "string",
    "Public tool should expose outputSchema via listTools()",
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
      tools.tools[0].inputSchema.properties?.tool as unknown as {
        enum: string[];
      }
    ).enum,
    ["echo"],
    "Agent tool should include 'echo' in its action enum",
  );
});

Deno.test(
  "Client list tools - agentic server, jsonSchema compatibility",
  async () => {
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
          jsonSchema({
            type: "object",
            properties: { message: { type: "string" } },
          }),
          (args: { message: string }) => ({
            content: [{ type: "text" as const, text: `Echo: ${args.message}` }],
          }),
          { internal: false },
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
      "Should have 2 tool registered and listed correctly",
    );
  },
);

Deno.test(
  "Client list tools - agentic server with MCP deps",
  {
    sanitizeResources: false, // Allow resource leaks from external MCP server
    sanitizeOps: false,
  },
  async () => {
    const server = await mcpc(
      [{ name: "test-server", version: "1.0.0" }, {}],
      [
        {
          name: "test-agent",
          description: `Test agent with dependencies.
<tool name="desktop-commander.read_file"/>
<tool name="desktop-commander.write_file"/>`,
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
        "Should have 1 tool (the agent)",
      );

      // Check that the agent tool has the correct action enum with the dependency tools
      const agentTool = tools.tools.find((t) => t.name === "test-agent");
      assertEquals(
        agentTool !== undefined,
        true,
        "Agent tool should exist",
      );

      const toolEnum = (
        agentTool!.inputSchema.properties?.tool as unknown as {
          enum: string[];
        }
      ).enum;

      assertArrayIncludes(
        toolEnum,
        ["desktop-commander_read_file", "desktop-commander_write_file"],
        "Agent should include tools from MCP dependencies",
      );
    } finally {
      await server.close();
    }
  },
);
