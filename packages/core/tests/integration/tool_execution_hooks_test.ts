/**
 * Tool execution lifecycle hooks test
 * Tests beforeToolExecute and afterToolExecute hooks
 */

import { assertEquals, assertExists } from "@std/assert";
import { mcpcLegacy as mcpc } from "../../mod.ts";
import type {
  AfterToolExecuteContext,
  BeforeToolExecuteContext,
  ToolPlugin,
} from "../../src/plugin-types.ts";
import { jsonSchema } from "../../src/utils/schema.ts";

// Type for tool results
interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

Deno.test("Tool execution hooks - beforeToolExecute modifies args", async () => {
  let capturedArgs: unknown = null;

  const plugin: ToolPlugin = {
    name: "args-modifier",
    beforeToolExecute: (context: BeforeToolExecuteContext) => {
      // Modify the args
      return {
        modifiedArgs: { ...(context.args as object), modified: true },
      };
    },
  };

  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [
      {
        name: "test-agent",
        description: "Test agent",
        deps: { mcpServers: {} },
        plugins: [plugin],
      },
    ],
    (server) => {
      server.tool(
        "echo",
        "Echo tool",
        jsonSchema({
          type: "object",
          properties: {
            input: { type: "string" },
            modified: { type: "boolean" },
          },
        }),
        (args) => {
          capturedArgs = args;
          return { content: [{ type: "text", text: JSON.stringify(args) }] };
        },
      );
    },
  );

  // Call the tool
  await server.callTool("echo", { input: "hello" });

  assertExists(capturedArgs);
  assertEquals((capturedArgs as Record<string, unknown>).modified, true);
  assertEquals((capturedArgs as Record<string, unknown>).input, "hello");
});

Deno.test("Tool execution hooks - beforeToolExecute can skip execution", async () => {
  let toolExecuted = false;

  const plugin: ToolPlugin = {
    name: "skip-execution",
    beforeToolExecute: () => {
      return {
        skipExecution: true,
        result: {
          content: [{ type: "text", text: "Skipped by plugin" }],
        },
      };
    },
  };

  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [
      {
        name: "test-agent",
        description: "Test agent",
        deps: { mcpServers: {} },
        plugins: [plugin],
      },
    ],
    (server) => {
      server.tool(
        "test",
        "Test tool",
        jsonSchema({ type: "object", properties: {} }),
        () => {
          toolExecuted = true;
          return { content: [{ type: "text", text: "Tool executed" }] };
        },
      );
    },
  );

  // Call the tool
  const result = (await server.callTool("test", {})) as {
    content: Array<{ type: string; text: string }>;
  };

  // Tool should not have been executed
  assertEquals(toolExecuted, false);
  assertEquals(result.content[0].text, "Skipped by plugin");
});

Deno.test("Tool execution hooks - afterToolExecute modifies result", async () => {
  const plugin: ToolPlugin = {
    name: "result-modifier",
    afterToolExecute: (context: AfterToolExecuteContext) => {
      const result = context.result as ToolResult;
      return {
        modifiedResult: {
          content: [
            {
              type: "text",
              text: `Modified: ${result.content[0].text}`,
            },
          ],
        },
      };
    },
  };

  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [
      {
        name: "test-agent",
        description: "Test agent",
        deps: { mcpServers: {} },
        plugins: [plugin],
      },
    ],
    (server) => {
      server.tool(
        "test",
        "Test tool",
        jsonSchema({ type: "object", properties: {} }),
        () => {
          return { content: [{ type: "text", text: "Original" }] };
        },
      );
    },
  );

  // Call the tool
  const result = (await server.callTool("test", {})) as {
    content: Array<{ type: string; text: string }>;
  };

  assertEquals(result.content[0].text, "Modified: Original");
});

Deno.test("Tool execution hooks - context includes agent name", async () => {
  let capturedAgentName: string | undefined;
  let capturedIsInternalCall: boolean | undefined;

  const plugin: ToolPlugin = {
    name: "context-capturer",
    beforeToolExecute: (context: BeforeToolExecuteContext) => {
      capturedAgentName = context.agentName;
      capturedIsInternalCall = context.isInternalCall;
      return undefined;
    },
  };

  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [
      {
        name: "my-agent",
        description: "Test agent",
        deps: { mcpServers: {} },
        plugins: [plugin],
      },
    ],
    (server) => {
      server.tool(
        "test",
        "Test tool",
        jsonSchema({ type: "object", properties: {} }),
        () => {
          return { content: [{ type: "text", text: "ok" }] };
        },
      );
    },
  );

  // Call with agent context
  await server.callTool("test", {}, { agentName: "my-agent" });

  assertEquals(capturedAgentName, "my-agent");
  assertEquals(capturedIsInternalCall, true);
});

Deno.test("Tool execution hooks - metadata passed from before to after", async () => {
  let afterMetadata: Record<string, unknown> | undefined;

  const plugin: ToolPlugin = {
    name: "metadata-passer",
    beforeToolExecute: () => {
      return {
        metadata: { startTime: Date.now(), customKey: "customValue" },
      };
    },
    afterToolExecute: (context: AfterToolExecuteContext) => {
      afterMetadata = context.metadata;
      return undefined;
    },
  };

  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [
      {
        name: "test-agent",
        description: "Test agent",
        deps: { mcpServers: {} },
        plugins: [plugin],
      },
    ],
    (server) => {
      server.tool(
        "test",
        "Test tool",
        jsonSchema({ type: "object", properties: {} }),
        () => {
          return { content: [{ type: "text", text: "ok" }] };
        },
      );
    },
  );

  await server.callTool("test", {});

  assertExists(afterMetadata);
  assertEquals(afterMetadata!.customKey, "customValue");
  assertExists(afterMetadata!.startTime);
});

Deno.test("Tool execution hooks - afterToolExecute receives execution time", async () => {
  let capturedExecutionTime: number | undefined;

  const plugin: ToolPlugin = {
    name: "timing-capturer",
    afterToolExecute: (context: AfterToolExecuteContext) => {
      capturedExecutionTime = context.executionTimeMs;
      return undefined;
    },
  };

  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [
      {
        name: "test-agent",
        description: "Test agent",
        deps: { mcpServers: {} },
        plugins: [plugin],
      },
    ],
    (server) => {
      server.tool(
        "test",
        "Test tool",
        jsonSchema({ type: "object", properties: {} }),
        async () => {
          // Simulate some work
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { content: [{ type: "text", text: "ok" }] };
        },
      );
    },
  );

  await server.callTool("test", {});

  assertExists(capturedExecutionTime);
  // Should have taken at least 10ms due to the delay
  assertEquals(capturedExecutionTime! >= 10, true);
});

Deno.test("Tool execution hooks - multiple plugins chain correctly", async () => {
  const order: string[] = [];

  const plugin1: ToolPlugin = {
    name: "plugin-1",
    enforce: "pre",
    beforeToolExecute: (context: BeforeToolExecuteContext) => {
      order.push("before-1");
      return {
        modifiedArgs: { ...(context.args as object), plugin1: true },
      };
    },
    afterToolExecute: () => {
      order.push("after-1");
      return undefined;
    },
  };

  const plugin2: ToolPlugin = {
    name: "plugin-2",
    beforeToolExecute: (context: BeforeToolExecuteContext) => {
      order.push("before-2");
      return {
        modifiedArgs: { ...(context.args as object), plugin2: true },
      };
    },
    afterToolExecute: () => {
      order.push("after-2");
      return undefined;
    },
  };

  let finalArgs: unknown = null;

  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [
      {
        name: "test-agent",
        description: "Test agent",
        deps: { mcpServers: {} },
        plugins: [plugin1, plugin2],
      },
    ],
    (server) => {
      server.tool(
        "test",
        "Test tool",
        jsonSchema({
          type: "object",
          properties: {
            plugin1: { type: "boolean" },
            plugin2: { type: "boolean" },
          },
        }),
        (args) => {
          finalArgs = args;
          return { content: [{ type: "text", text: "ok" }] };
        },
      );
    },
  );

  await server.callTool("test", {});

  // Before hooks should run in order (pre first)
  assertEquals(order[0], "before-1");
  assertEquals(order[1], "before-2");
  // After hooks should run in order
  assertEquals(order[2], "after-1");
  assertEquals(order[3], "after-2");

  // Both plugins should have modified args
  assertExists(finalArgs);
  assertEquals((finalArgs as Record<string, unknown>).plugin1, true);
  assertEquals((finalArgs as Record<string, unknown>).plugin2, true);
});

Deno.test("Tool execution hooks - wasSkipped is true when execution skipped", async () => {
  let wasSkipped: boolean | undefined;

  const skipPlugin: ToolPlugin = {
    name: "skipper",
    enforce: "pre",
    beforeToolExecute: () => {
      return {
        skipExecution: true,
        result: { content: [{ type: "text", text: "skipped" }] },
      };
    },
  };

  const checkerPlugin: ToolPlugin = {
    name: "checker",
    afterToolExecute: (context: AfterToolExecuteContext) => {
      wasSkipped = context.wasSkipped;
      return undefined;
    },
  };

  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [
      {
        name: "test-agent",
        description: "Test agent",
        deps: { mcpServers: {} },
        plugins: [skipPlugin, checkerPlugin],
      },
    ],
    (server) => {
      server.tool(
        "test",
        "Test tool",
        jsonSchema({ type: "object", properties: {} }),
        () => {
          return { content: [{ type: "text", text: "executed" }] };
        },
      );
    },
  );

  await server.callTool("test", {});

  assertEquals(wasSkipped, true);
});

Deno.test("Tool execution hooks - isError flag when tool throws", async () => {
  let capturedIsError: boolean | undefined;
  let capturedResult: ToolResult | undefined;

  const plugin: ToolPlugin = {
    name: "error-capturer",
    afterToolExecute: (context: AfterToolExecuteContext) => {
      capturedIsError = context.isError;
      capturedResult = context.result as ToolResult;
      return undefined;
    },
  };

  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [
      {
        name: "test-agent",
        description: "Test agent",
        deps: { mcpServers: {} },
        plugins: [plugin],
      },
    ],
    (server) => {
      server.tool(
        "failing-tool",
        "A tool that throws",
        jsonSchema({ type: "object", properties: {} }),
        () => {
          throw new Error("Tool execution failed");
        },
      );
    },
  );

  const result = (await server.callTool("failing-tool", {})) as ToolResult;

  // isError should be true in context
  assertEquals(capturedIsError, true);
  // Result should have isError flag
  assertEquals(result.isError, true);
  // Result should contain error message
  assertEquals(result.content[0].text.includes("Tool execution failed"), true);
  // Captured result should also have error
  assertExists(capturedResult);
  assertEquals(capturedResult!.isError, true);
});

Deno.test("Tool execution hooks - afterToolExecute can modify error result", async () => {
  const plugin: ToolPlugin = {
    name: "error-modifier",
    afterToolExecute: (context: AfterToolExecuteContext) => {
      if (context.isError) {
        return {
          modifiedResult: {
            content: [{ type: "text", text: "Error handled gracefully" }],
            isError: false, // Convert error to success
          },
        };
      }
      return undefined;
    },
  };

  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [
      {
        name: "test-agent",
        description: "Test agent",
        deps: { mcpServers: {} },
        plugins: [plugin],
      },
    ],
    (server) => {
      server.tool(
        "failing-tool",
        "A tool that throws",
        jsonSchema({ type: "object", properties: {} }),
        () => {
          throw new Error("Original error");
        },
      );
    },
  );

  const result = (await server.callTool("failing-tool", {})) as ToolResult;

  // Plugin converted error to success
  assertEquals(result.isError, false);
  assertEquals(result.content[0].text, "Error handled gracefully");
});

Deno.test("Tool execution hooks - markAsError can mark result as error", async () => {
  const plugin: ToolPlugin = {
    name: "error-marker",
    afterToolExecute: () => {
      return {
        markAsError: true,
      };
    },
  };

  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [
      {
        name: "test-agent",
        description: "Test agent",
        deps: { mcpServers: {} },
        plugins: [plugin],
      },
    ],
    (server) => {
      server.tool(
        "test",
        "Test tool",
        jsonSchema({ type: "object", properties: {} }),
        () => {
          return { content: [{ type: "text", text: "ok" }] };
        },
      );
    },
  );

  const result = (await server.callTool("test", {})) as ToolResult;

  // Plugin should have marked result as error
  assertEquals(result.isError, true);
  assertEquals(result.content[0].text, "ok");
});

Deno.test("Tool execution hooks - beforeToolExecute receives toolDefinition", async () => {
  let capturedToolDefinition: unknown;

  const plugin: ToolPlugin = {
    name: "definition-capturer",
    beforeToolExecute: (context: BeforeToolExecuteContext) => {
      capturedToolDefinition = context.toolDefinition;
      return undefined;
    },
  };

  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [
      {
        name: "test-agent",
        description: "Test agent",
        deps: { mcpServers: {} },
        plugins: [plugin],
      },
    ],
    (server) => {
      server.tool(
        "my-tool",
        "My tool description",
        jsonSchema({
          type: "object",
          properties: { input: { type: "string" } },
        }),
        () => {
          return { content: [{ type: "text", text: "ok" }] };
        },
      );
    },
  );

  await server.callTool("my-tool", { input: "test" });

  assertExists(capturedToolDefinition);
  const def = capturedToolDefinition as {
    name: string;
    description: string;
    execute: unknown;
  };
  assertEquals(def.name, "my-tool");
  assertEquals(def.description, "My tool description");
  assertExists(def.execute);
});
