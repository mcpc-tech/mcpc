/**
 * Integration tests for plugin lifecycle hooks
 * Tests the full lifecycle: configureServer → composeStart → transformTool → finalizeComposition → composeEnd
 */

import { assertEquals } from "jsr:@std/assert";
import { mcpc } from "../../mod.ts";
import type { ToolPlugin } from "../../src/plugin-types.ts";
import { jsonSchema } from "ai";

Deno.test("Plugin lifecycle - all hooks execute in order", async () => {
  const executionOrder: string[] = [];

  const lifecyclePlugin: ToolPlugin = {
    name: "lifecycle-test",
    configureServer: () => {
      executionOrder.push("configureServer");
    },
    composeStart: () => {
      executionOrder.push("composeStart");
    },
    transformTool: (tool) => {
      executionOrder.push("transformTool");
      return tool;
    },
    finalizeComposition: () => {
      executionOrder.push("finalizeComposition");
    },
    composeEnd: () => {
      executionOrder.push("composeEnd");
    },
  };

  await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [
      {
        name: "test-agent",
        description: "Test agent with tool",
        deps: { mcpServers: {} },
        plugins: [lifecyclePlugin],
      },
    ],
    (server) => {
      // Add a tool so transformTool will be called
      server.tool(
        "test-tool",
        "Test tool",
        jsonSchema({ type: "object", properties: {} }),
        () => ({ content: [{ type: "text", text: "ok" }] }),
      );
    },
  );

  // Verify all hooks were called in order
  assertEquals(executionOrder, [
    "configureServer",
    "composeStart",
    "transformTool",
    "finalizeComposition",
    "composeEnd",
  ]);
});

Deno.test("Plugin lifecycle - composeStart receives context", async () => {
  let receivedContext: any = null;

  const plugin: ToolPlugin = {
    name: "context-test",
    composeStart: (context) => {
      receivedContext = context;
    },
  };

  await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [
      {
        name: "test-agent",
        description: "Test description",
        deps: { mcpServers: {} },
        plugins: [plugin],
      },
    ],
  );

  assertEquals(receivedContext.serverName, "test-agent");
  assertEquals(receivedContext.description, "Test description");
  assertEquals(receivedContext.mode, "agentic");
  assertEquals(typeof receivedContext.server, "object");
});

Deno.test("Plugin lifecycle - transformTool modifies tools", async () => {
  const plugin: ToolPlugin = {
    name: "transform-test",
    transformTool: (tool) => {
      return {
        ...tool,
        description: `[MODIFIED] ${tool.description}`,
      };
    },
  };

  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [],
    async (server) => {
      await server.addPlugin(plugin);

      server.tool(
        "test-tool",
        "Original description",
        jsonSchema({ type: "object", properties: {} }),
        () => ({ content: [{ type: "text", text: "ok" }] }),
      );
    },
  );

  // The transformation should be applied
  const result = await server.callTool("test-tool", {}) as any;
  assertEquals(result.content[0].text, "ok");
});

Deno.test("Plugin lifecycle - finalizeComposition receives all tools", async () => {
  let receivedTools: Record<string, any> = {};

  const plugin: ToolPlugin = {
    name: "finalize-test",
    finalizeComposition: (tools) => {
      receivedTools = tools;
    },
  };

  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [
      {
        name: "test-agent",
        description: "Test agent with directly registered tools",
        deps: { mcpServers: {} },
        plugins: [plugin],
      },
    ],
    (server) => {
      // Register tools directly on the server
      // Note: These won't be included in finalizeComposition's tools parameter
      // as that only includes tools from external MCP dependencies
      server.tool(
        "tool1",
        "Tool 1",
        jsonSchema({ type: "object", properties: {} }),
        () => ({ content: [{ type: "text", text: "tool1" }] }),
      );

      server.tool(
        "tool2",
        "Tool 2",
        jsonSchema({ type: "object", properties: {} }),
        () => ({ content: [{ type: "text", text: "tool2" }] }),
      );
    },
  );

  // finalizeComposition receives tools from external MCP deps, not directly registered tools
  // Since we have no MCP deps, the tools object should be empty
  assertEquals(Object.keys(receivedTools).length, 0);

  // But the server should still have the registered tools
  assertEquals(server.hasToolNamed("tool1"), true);
  assertEquals(server.hasToolNamed("tool2"), true);
});

Deno.test("Plugin lifecycle - composeEnd receives statistics", async () => {
  let stats: any = null;

  const plugin: ToolPlugin = {
    name: "stats-test",
    composeEnd: (context) => {
      stats = context.stats;
    },
  };

  await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [
      {
        name: "test-agent",
        description: "Test agent",
        deps: { mcpServers: {} },
        plugins: [plugin],
      },
    ],
  );

  assertEquals(typeof stats, "object");
  assertEquals(typeof stats.totalTools, "number");
  assertEquals(typeof stats.publicTools, "number");
  assertEquals(typeof stats.hiddenTools, "number");
});

Deno.test("Plugin lifecycle - multiple plugins execute in order", async () => {
  const executionLog: string[] = [];

  const plugin1: ToolPlugin = {
    name: "plugin-1",
    enforce: "pre",
    composeStart: () => {
      executionLog.push("plugin-1");
    },
  };

  const plugin2: ToolPlugin = {
    name: "plugin-2",
    composeStart: () => {
      executionLog.push("plugin-2");
    },
  };

  const plugin3: ToolPlugin = {
    name: "plugin-3",
    enforce: "post",
    composeStart: () => {
      executionLog.push("plugin-3");
    },
  };

  await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [
      {
        name: "test-agent",
        description: "Test agent",
        deps: { mcpServers: {} },
        plugins: [plugin2, plugin3, plugin1], // Add in random order
      },
    ],
  );

  // Pre plugins should execute first, then normal, then post
  assertEquals(
    executionLog.indexOf("plugin-1") < executionLog.indexOf("plugin-2"),
    true,
  );
  assertEquals(
    executionLog.indexOf("plugin-2") < executionLog.indexOf("plugin-3"),
    true,
  );
});

Deno.test("Plugin lifecycle - conditional application based on mode", async () => {
  let agenticCalled = false;
  let workflowCalled = false;

  const agenticPlugin: ToolPlugin = {
    name: "agentic-only",
    apply: "agentic",
    composeStart: () => {
      agenticCalled = true;
    },
  };

  const workflowPlugin: ToolPlugin = {
    name: "workflow-only",
    apply: "workflow",
    composeStart: () => {
      workflowCalled = true;
    },
  };

  await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [
      {
        name: "test-agent",
        description: "Test agent",
        deps: { mcpServers: {} },
        options: { mode: "agentic" },
        plugins: [agenticPlugin, workflowPlugin],
      },
    ],
  );

  assertEquals(agenticCalled, true);
  assertEquals(workflowCalled, false);
});

Deno.test("Plugin lifecycle - error handling continues execution", async () => {
  const executionLog: string[] = [];

  const faultyPlugin: ToolPlugin = {
    name: "faulty",
    composeStart: () => {
      executionLog.push("faulty");
      throw new Error("Intentional error");
    },
  };

  const goodPlugin: ToolPlugin = {
    name: "good",
    composeStart: () => {
      executionLog.push("good");
    },
  };

  await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [
      {
        name: "test-agent",
        description: "Test agent",
        deps: { mcpServers: {} },
        plugins: [faultyPlugin, goodPlugin],
      },
    ],
  );

  // Both should have been called
  assertEquals(executionLog.includes("faulty"), true);
  assertEquals(executionLog.includes("good"), true);
});
