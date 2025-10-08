/**
 * Integration tests for AI SDK Adapter
 *
 * Tests the convertToAISDKTools function that converts MCPC server tools
 * to AI SDK compatible format.
 */

import { assertEquals, assertExists } from "@std/assert";
import { type ComposeDefinition, convertToAISDKTools, mcpc } from "@mcpc/core";

// Mock AI SDK helpers for testing
const mockTool = (options: {
  description: string;
  inputSchema: any;
  execute: (input: any) => Promise<any>;
}) => {
  return {
    type: "function" as const,
    description: options.description,
    parameters: options.inputSchema,
    execute: options.execute,
  };
};

const mockJsonSchema = (schema: any) => {
  // Just return the schema as-is for testing
  return schema;
};

Deno.test("convertToAISDKTools - basic conversion", async () => {
  const toolDefinitions: ComposeDefinition[] = [
    {
      name: "test-agent",
      description: "A test agent",
      options: {
        mode: "agentic",
      },
      deps: {
        mcpServers: {},
      },
    },
  ];

  const server = await mcpc(
    [
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } },
    ],
    toolDefinitions,
    (server) => {
      // Add a test tool
      server.tool(
        "test-tool",
        "A test tool",
        {
          type: "object",
          properties: {
            input: { type: "string" },
          },
          required: ["input"],
        } as any,
        ({ input }: { input: string }) => {
          return { result: `processed: ${input}` };
        },
      );
    },
  );

  try {
    const tools = convertToAISDKTools(server, {
      tool: mockTool,
      jsonSchema: mockJsonSchema,
    });

    // Verify conversion
    assertExists(tools);
    assertEquals(typeof tools, "object");

    // Should have converted tools (test-agent + test-tool = 2 tools)
    const toolNames = Object.keys(tools);
    assertEquals(toolNames.length >= 1, true);

    console.log(
      `✅ Converted ${toolNames.length} tool(s):`,
      toolNames.join(", "),
    );
  } finally {
    await server.close();
  }
});

Deno.test(
  "convertToAISDKTools - with MCP server dependency",
  {
    sanitizeResources: false, // Allow resource leaks from external MCP server
    sanitizeOps: false,
  },
  async () => {
    const toolDefinitions: ComposeDefinition[] = [
      {
        name: "file-manager",
        description: `File system assistant.

Available tools:
<tool name="desktop-commander.list_directory"/>`,
        options: {
          mode: "agentic",
        },
        deps: {
          mcpServers: {
            "desktop-commander": {
              command: "npx",
              args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
              transportType: "stdio" as const,
            },
          },
        },
      },
    ];

    const server = await mcpc(
      [
        { name: "test-server", version: "1.0.0" },
        { capabilities: { tools: {} } },
      ],
      toolDefinitions,
    );

    try {
      // Get public tools
      const mcpcTools = server.getPublicTools();
      console.log(`Found ${mcpcTools.length} public tool(s)`);

      // Verify we have tools
      assertEquals(mcpcTools.length > 0, true);

      // Convert to AI SDK format
      const tools = convertToAISDKTools(server, {
        tool: mockTool,
        jsonSchema: mockJsonSchema,
      });

      // Verify conversion
      assertExists(tools);
      const toolNames = Object.keys(tools);
      assertEquals(toolNames.length, mcpcTools.length);

      console.log(`✅ Successfully converted tools:`, toolNames.join(", "));

      // Verify each converted tool has expected structure
      for (const toolName of toolNames) {
        const convertedTool = tools[toolName] as any;
        assertExists(convertedTool.description);
        assertExists(convertedTool.parameters);
        assertExists(convertedTool.execute);
        assertEquals(typeof convertedTool.execute, "function");
      }
    } finally {
      await server.close();
    }
  },
);

Deno.test("convertToAISDKTools - tool execution", async () => {
  const toolDefinitions: ComposeDefinition[] = [
    {
      name: "calculator",
      description: "A calculator agent",
      options: {
        mode: "agentic",
      },
      deps: {
        mcpServers: {},
      },
    },
  ];

  const server = await mcpc(
    [
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } },
    ],
    toolDefinitions,
    (server) => {
      // Add a calculator tool
      server.tool(
        "add",
        "Add two numbers",
        {
          type: "object",
          properties: {
            a: { type: "number" },
            b: { type: "number" },
          },
          required: ["a", "b"],
        } as any,
        ({ a, b }: { a: number; b: number }) => {
          return { result: a + b };
        },
      );
    },
  );

  try {
    const tools = convertToAISDKTools(server, {
      tool: mockTool,
      jsonSchema: mockJsonSchema,
    });
    const addTool = tools["add"] as any;

    // Verify tool exists and has correct structure
    assertExists(addTool);
    assertEquals(addTool.description, "Add two numbers");
    assertExists(addTool.execute);

    // Test tool execution through the adapter
    const result = await addTool.execute({ a: 5, b: 3 });
    console.log("Tool execution result:", result);

    // The result should contain the calculator response
    assertExists(result);
  } finally {
    await server.close();
  }
});
