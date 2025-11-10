/**
 * Test for Agentic Executor with new useTool parameter
 */

import { assertEquals, assertExists } from "@std/assert";
import { mcpc } from "../../mod.ts";

Deno.test(
  "Agentic mode - uses useTool parameter instead of action",
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
      // Test tool execution with new useTool parameter
      const result: any = await server.callTool("test-agent", {
        useTool: "test-tool1",
        "test-tool1": {},
        hasDefinitions: ["test-tool1"],
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
  "Agentic mode - provides tool schemas when requested",
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
      // Request tool schemas
      const result: any = await server.callTool("schema-agent", {
        useTool: "tool-alpha",
        "tool-alpha": { param1: "test" },
        definitionsOf: ["tool-beta"],
        hasDefinitions: ["tool-alpha"],
      });

      assertEquals(result.isError, undefined);
      assertExists(result.content);

      const contentText = result.content.map((c: any) => c.text).join("\n");

      // Should execute the selected tool
      assertEquals(contentText.includes("Alpha executed"), true);

      // Should provide schema for requested tool
      assertEquals(contentText.includes("tool-beta"), true);
      assertEquals(contentText.includes("tool_definition"), true);
      assertEquals(contentText.includes("param2"), true);
    } finally {
      await server.close?.();
    }
  },
);

Deno.test(
  "Agentic mode - does not duplicate schemas for hasDefinitions",
  async () => {
    const server = await mcpc(
      [
        { name: "test-no-duplicate", version: "1.0.0" },
        {
          capabilities: { tools: {} },
        },
      ],
      [
        {
          name: "no-dup-agent",
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
          { type: "object", properties: {} },
          () => ({
            content: [{ type: "text", text: "Gamma executed" }],
          }),
        );
      },
    );

    try {
      const result: any = await server.callTool("no-dup-agent", {
        useTool: "tool-gamma",
        "tool-gamma": {},
        definitionsOf: ["tool-gamma"],
        hasDefinitions: ["tool-gamma"], // Already have this schema
      });

      assertEquals(result.isError, undefined);
      const contentText = result.content.map((c: any) => c.text).join("\n");

      // Should NOT include schema section since it's already available
      assertEquals(contentText.includes("Tool Schemas"), false);
    } finally {
      await server.close?.();
    }
  },
);
