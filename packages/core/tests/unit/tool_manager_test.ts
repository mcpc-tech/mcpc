/**
 * Unit tests for ToolManager
 * Tests tool registration, configuration, and name resolution
 */

import { assertEquals } from "@std/assert";
import { mcpc } from "../../mod.ts";
import { jsonSchema } from "../../src/utils/schema.ts";

Deno.test("ToolManager - register and retrieve tool", async () => {
  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [],
    (server) => {
      server.tool(
        "test-tool",
        "A test tool",
        jsonSchema({
          type: "object",
          properties: { value: { type: "string" } },
        }),
        (args: any) => ({
          content: [{ type: "text", text: args.value }],
        }),
      );
    },
  );

  const result = await server.callTool("test-tool", { value: "hello" }) as any;
  assertEquals(result.content[0].text, "hello");
});

Deno.test("ToolManager - tool name resolution", async () => {
  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [],
    (server) => {
      server.tool(
        "my_tool",
        "Test tool",
        jsonSchema({ type: "object", properties: {} }),
        () => ({ content: [{ type: "text", text: "ok" }] }),
      );
    },
  );

  // Should resolve with original name
  const result = await server.callTool("my_tool", {}) as any;
  assertEquals(result.content[0].text, "ok");
});

Deno.test("ToolManager - internal tool visibility", async () => {
  const transformedTools: string[] = [];

  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [
      {
        name: "test-agent",
        description: "Test agent",
        deps: { mcpServers: {} },
        plugins: [{
          name: "transform-test",
          transformTool: (tool) => {
            transformedTools.push(tool.name);
            return tool;
          },
        }],
      },
    ],
    (server) => {
      server.tool(
        "internal-tool",
        "Internal only",
        jsonSchema({ type: "object", properties: {} }),
        () => ({ content: [{ type: "text", text: "internal" }] }),
        { internal: true },
      );

      server.tool(
        "public-tool",
        "Public tool",
        jsonSchema({ type: "object", properties: {} }),
        () => ({ content: [{ type: "text", text: "public" }] }),
      );
    },
  );

  // Internal tools should be callable via callTool
  const result = await server.callTool("internal-tool", {}) as any;
  assertEquals(result.content[0].text, "internal");

  // Get tool lists - internal tools are now hidden
  const hiddenTools = server.getHiddenToolNames();
  const publicTools = server.getPublicToolNames();

  assertEquals(hiddenTools.includes("internal-tool"), true);
  assertEquals(publicTools.includes("internal-tool"), false);

  // Verify that tools registered in setup hooks are processed by plugins
  assertEquals(transformedTools.includes("internal-tool"), true);
  assertEquals(transformedTools.includes("public-tool"), true);
});

Deno.test("ToolManager - tool configuration", async () => {
  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [],
    (server) => {
      server.tool(
        "configurable",
        "Original description",
        jsonSchema({ type: "object", properties: {} }),
        () => ({ content: [{ type: "text", text: "ok" }] }),
      );

      // Configure the tool
      server.configTool("configurable", {
        description: "Updated description",
        visibility: { hidden: true },
      });
    },
  );

  const config = server.getToolConfig("configurable");
  assertEquals(config?.description, "Updated description");
  assertEquals(config?.visibility?.hidden, true);
});

Deno.test("ToolManager - hidden tools", async () => {
  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [],
    (server) => {
      server.tool(
        "hidden-tool",
        "Hidden",
        jsonSchema({ type: "object", properties: {} }),
        () => ({ content: [{ type: "text", text: "hidden" }] }),
      );

      server.configTool("hidden-tool", {
        visibility: { hidden: true },
      });
    },
  );

  const hiddenTools = server.getHiddenToolNames();
  assertEquals(hiddenTools.includes("hidden-tool"), true);

  // Hidden tools should still be callable
  const result = await server.callTool("hidden-tool", {}) as any;
  assertEquals(result.content[0].text, "hidden");
});

Deno.test("ToolManager - public tools", async () => {
  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [],
    (server) => {
      server.tool(
        "public-tool",
        "Public",
        jsonSchema({ type: "object", properties: {} }),
        () => ({ content: [{ type: "text", text: "public" }] }),
      );

      server.configTool("public-tool", {
        visibility: { public: true },
      });
    },
  );

  const publicTools = server.getPublicToolNames();
  assertEquals(publicTools.includes("public-tool"), true);
});

Deno.test("ToolManager - context tools (not public, not hidden)", async () => {
  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [],
    (server) => {
      server.tool(
        "context-tool",
        "Context tool",
        jsonSchema({ type: "object", properties: {} }),
        () => ({ content: [{ type: "text", text: "context" }] }),
      );
    },
  );

  // Context tools are not public and not hidden - visible in agent context only
  const publicTools = server.getPublicToolNames();
  const hiddenTools = server.getHiddenToolNames();
  assertEquals(publicTools.includes("context-tool"), false);
  assertEquals(hiddenTools.includes("context-tool"), false);
});

Deno.test("ToolManager - check tool existence", async () => {
  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [],
    (server) => {
      server.tool(
        "existing-tool",
        "Exists",
        jsonSchema({ type: "object", properties: {} }),
        () => ({ content: [{ type: "text", text: "exists" }] }),
      );
    },
  );

  assertEquals(server.hasToolNamed("existing-tool"), true);
  assertEquals(server.hasToolNamed("non-existing-tool"), false);
});

Deno.test("ToolManager - remove tool configuration", async () => {
  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [],
    (server) => {
      server.tool(
        "removable",
        "Test",
        jsonSchema({ type: "object", properties: {} }),
        () => ({ content: [{ type: "text", text: "ok" }] }),
      );

      server.configTool("removable", {
        description: "Configured",
      });
    },
  );

  assertEquals(server.getToolConfig("removable")?.description, "Configured");

  const removed = server.removeToolConfig("removable");
  assertEquals(removed, true);
  assertEquals(server.getToolConfig("removable"), undefined);
});
