/**
 * Test for Agentic Executor with tool + args schema
 */

import { assertEquals, assertExists } from "@std/assert";
import { mcpc } from "../../mod.ts";

Deno.test(
  "Agentic mode - executes tool with tool + args format",
  async () => {
    const server = await mcpc(
      [
        { name: "test-agentic", version: "1.0.0" },
        {
          capabilities: { tools: {} },
        },
      ],
      [
        {
          name: "test-agent",
          description: `Test agent with tools.
<tool name="test-tool1"/>
<tool name="test-tool2"/>`,
          deps: { mcpServers: {} },
          options: {
            mode: "agentic",
          },
        },
      ],
      (server) => {
        // Add test tools
        server.tool(
          "test-tool1",
          "Test tool 1",
          { type: "object", properties: {} },
          () => ({
            content: [{ type: "text", text: "Tool 1 executed" }],
          }),
        );
        server.tool(
          "test-tool2",
          "Test tool 2",
          { type: "object", properties: {} },
          () => ({
            content: [{ type: "text", text: "Tool 2 executed" }],
          }),
        );
      },
    );

    try {
      // Test tool execution with new tool + args format
      const result: any = await server.callTool("test-agent", {
        tool: "test-tool1",
        args: {},
      });

      assertEquals(result.isError, undefined);
      assertExists(result.content);
      assertEquals(result.content.length > 0, true);

      const contentText = result.content.map((c: any) => c.text).join(" ");
      assertEquals(contentText.includes("Tool 1 executed"), true);
    } finally {
      await server.close?.();
    }
  },
);

Deno.test(
  "Agentic mode - provides tool schemas via man command",
  async () => {
    const server = await mcpc(
      [
        { name: "test-schema-provision", version: "1.0.0" },
        {
          capabilities: { tools: {} },
        },
      ],
      [
        {
          name: "schema-agent",
          description: `Agent that provides schemas.
<tool name="tool-alpha"/>
<tool name="tool-beta"/>`,
          deps: { mcpServers: {} },
          options: {
            mode: "agentic",
          },
        },
      ],
      (server) => {
        server.tool(
          "tool-alpha",
          "Alpha tool",
          {
            type: "object",
            properties: {
              param1: { type: "string", description: "First parameter" },
            },
          },
          () => ({
            content: [{ type: "text", text: "Alpha executed" }],
          }),
          {
            outputSchema: {
              type: "object",
              properties: {
                alphaResult: {
                  type: "string",
                  description: "Structured alpha result",
                },
              },
              required: ["alphaResult"],
            },
          },
        );
        server.tool(
          "tool-beta",
          "Beta tool",
          {
            type: "object",
            properties: {
              param2: { type: "number", description: "Second parameter" },
            },
          },
          () => ({
            content: [{ type: "text", text: "Beta executed" }],
          }),
        );
      },
    );

    try {
      // Request tool schemas via man command - args should be { tools: [...] }
      const result: any = await server.callTool("schema-agent", {
        tool: "man",
        args: { tools: ["tool-alpha", "tool-beta"] },
      });

      assertEquals(result.isError, undefined);
      assertExists(result.content);

      const contentText = result.content.map((c: any) => c.text).join("\n");

      // Should provide schemas for requested tools
      assertEquals(contentText.includes("tool-alpha"), true);
      assertEquals(contentText.includes("tool-beta"), true);
      assertEquals(contentText.includes("param1"), true);
      assertEquals(contentText.includes("param2"), true);
      assertEquals(contentText.includes("outputSchema"), true);
      assertEquals(contentText.includes("alphaResult"), true);
    } finally {
      await server.close?.();
    }
  },
);

Deno.test(
  "Agentic mode - man command with tools and manual returns both",
  async () => {
    const server = await mcpc(
      [
        { name: "test-manual-tools", version: "1.0.0" },
        {
          capabilities: { tools: {} },
        },
      ],
      [
        {
          name: "manual-agent",
          description: `Agent with manual.
<tool name="tool-one"/>
<tool name="tool-two"/>`,
          manual: "# This is the manual\n\nDetailed instructions here.",
          deps: { mcpServers: {} },
          options: {
            mode: "agentic",
          },
        },
      ],
      (server) => {
        server.tool(
          "tool-one",
          "Tool one",
          {
            type: "object",
            properties: {
              input: { type: "string", description: "Input param" },
            },
          },
          () => ({
            content: [{ type: "text", text: "Tool one executed" }],
          }),
        );
        server.tool(
          "tool-two",
          "Tool two",
          {
            type: "object",
            properties: {},
          },
          () => ({
            content: [{ type: "text", text: "Tool two executed" }],
          }),
        );
      },
    );

    try {
      // Request both tools and manual
      const result: any = await server.callTool("manual-agent", {
        tool: "man",
        args: { tools: ["tool-one", "tool-two"], manual: true },
      });

      assertEquals(result.isError, undefined);
      assertExists(result.content);

      const contentText = result.content.map((c: any) => c.text).join("\n");

      // Should include tool schemas
      assertEquals(
        contentText.includes("tool-one"),
        true,
        "Should include tool-one schema",
      );
      assertEquals(
        contentText.includes("tool-two"),
        true,
        "Should include tool-two schema",
      );
      assertEquals(
        contentText.includes("input"),
        true,
        "Should include tool-one's input param",
      );

      // Should include manual content
      assertEquals(
        contentText.includes("This is the manual"),
        true,
        "Should include manual",
      );
      assertEquals(
        contentText.includes("Detailed instructions"),
        true,
        "Should include manual details",
      );

      // Should have separator
      assertEquals(
        contentText.includes("---"),
        true,
        "Should have separator between tools and manual",
      );
    } finally {
      await server.close?.();
    }
  },
);

Deno.test(
  "Agentic mode - executes tool with parameters",
  async () => {
    const server = await mcpc(
      [
        { name: "test-params", version: "1.0.0" },
        {
          capabilities: { tools: {} },
        },
      ],
      [
        {
          name: "params-agent",
          description: `Agent test.
<tool name="tool-gamma"/>`,
          deps: { mcpServers: {} },
          options: {
            mode: "agentic",
          },
        },
      ],
      (server) => {
        server.tool(
          "tool-gamma",
          "Gamma tool",
          {
            type: "object",
            properties: {
              message: { type: "string" },
            },
          },
          (params: { message?: string }) => ({
            content: [{ type: "text", text: `Gamma: ${params.message}` }],
          }),
        );
      },
    );

    try {
      const result: any = await server.callTool("params-agent", {
        tool: "tool-gamma",
        args: { message: "Hello World" },
      });

      assertEquals(result.isError, undefined);
      const contentText = result.content.map((c: any) => c.text).join("\n");

      // Should include the parameter value in output
      assertEquals(contentText.includes("Gamma: Hello World"), true);
    } finally {
      await server.close?.();
    }
  },
);
