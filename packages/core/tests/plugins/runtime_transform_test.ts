/**
 * Test runtime transformation hooks (transformInput/transformOutput)
 */

import { assertEquals } from "@std/assert";
import { mcpc } from "../../mod.ts";
import type { ToolPlugin } from "../../src/plugin-types.ts";
import type { ComposableMCPServer } from "../../src/compose.ts";
import { jsonSchema } from "ai";

Deno.test("Runtime transformation - transformInput hook", async () => {
  // Create a plugin that transforms input
  const inputTransformPlugin: ToolPlugin = {
    name: "test-input-transform",
    transformInput: (args: any) => {
      // Add a prefix to the message
      if (args && typeof args.message === "string") {
        return {
          ...args,
          message: `[TRANSFORMED] ${args.message}`,
        };
      }
      return args;
    },
  };

  // Create server with plugin
  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [],
    async (server: ComposableMCPServer) => {
      await server.addPlugin(inputTransformPlugin);

      // Register a test tool
      server.tool(
        "echo",
        "Echo back the message",
        jsonSchema({
          type: "object",
          properties: {
            message: { type: "string" },
          },
          required: ["message"],
        }),
        (args: any) => {
          return {
            content: [{ type: "text", text: args.message }],
          };
        },
      );
    },
  );

  // Call the tool
  const result = await server.callTool("echo", { message: "Hello" });

  // Verify the input was transformed
  assertEquals(result, {
    content: [{ type: "text", text: "[TRANSFORMED] Hello" }],
  });
});

Deno.test("Runtime transformation - transformOutput hook", async () => {
  // Create a plugin that transforms output
  const outputTransformPlugin: ToolPlugin = {
    name: "test-output-transform",
    transformOutput: (result: any) => {
      // Add metadata to the result
      if (result && result.content) {
        return {
          ...result,
          _meta: {
            transformed: true,
            timestamp: "2024-01-01",
          },
        };
      }
      return result;
    },
  };

  // Create server with plugin
  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [],
    async (server: ComposableMCPServer) => {
      await server.addPlugin(outputTransformPlugin);

      // Register a test tool
      server.tool(
        "greet",
        "Greet someone",
        jsonSchema({
          type: "object",
          properties: {
            name: { type: "string" },
          },
          required: ["name"],
        }),
        (args: any) => {
          return {
            content: [{ type: "text", text: `Hello, ${args.name}!` }],
          };
        },
      );
    },
  );

  // Call the tool
  const result = await server.callTool("greet", { name: "World" }) as any;

  // Verify the output was transformed
  assertEquals(result.content, [{ type: "text", text: "Hello, World!" }]);
  assertEquals(result._meta, {
    transformed: true,
    timestamp: "2024-01-01",
  });
});

Deno.test(
  "Runtime transformation - both input and output hooks",
  async () => {
    // Create a plugin with both hooks
    const fullTransformPlugin: ToolPlugin = {
      name: "test-full-transform",
      transformInput: (args: any) => {
        // Uppercase the input
        if (args && typeof args.text === "string") {
          return {
            ...args,
            text: args.text.toUpperCase(),
          };
        }
        return args;
      },
      transformOutput: (result: any) => {
        // Add a suffix to the output
        if (result && result.content && result.content[0]) {
          return {
            ...result,
            content: [{
              ...result.content[0],
              text: `${result.content[0].text} [PROCESSED]`,
            }],
          };
        }
        return result;
      },
    };

    // Create server with plugin
    const server = await mcpc(
      [{ name: "test-server", version: "1.0.0" }, {}],
      [],
      async (server: ComposableMCPServer) => {
        await server.addPlugin(fullTransformPlugin);

        // Register a test tool
        server.tool(
          "process",
          "Process text",
          jsonSchema({
            type: "object",
            properties: {
              text: { type: "string" },
            },
            required: ["text"],
          }),
          (args: any) => {
            return {
              content: [{ type: "text", text: args.text }],
            };
          },
        );
      },
    );

    // Call the tool
    const result = await server.callTool("process", { text: "hello" }) as any;

    // Verify both transformations were applied
    assertEquals(result.content[0].text, "HELLO [PROCESSED]");
  },
);

Deno.test("Runtime transformation - multiple plugins chain", async () => {
  // Create multiple transform plugins
  const plugin1: ToolPlugin = {
    name: "transform-1",
    enforce: "pre",
    transformInput: (args: any) => {
      if (args && typeof args.value === "number") {
        return { ...args, value: args.value + 1 };
      }
      return args;
    },
  };

  const plugin2: ToolPlugin = {
    name: "transform-2",
    transformInput: (args: any) => {
      if (args && typeof args.value === "number") {
        return { ...args, value: args.value * 2 };
      }
      return args;
    },
  };

  const plugin3: ToolPlugin = {
    name: "transform-3",
    enforce: "post",
    transformInput: (args: any) => {
      if (args && typeof args.value === "number") {
        return { ...args, value: args.value + 10 };
      }
      return args;
    },
  };

  // Create server with plugins
  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [],
    async (server: ComposableMCPServer) => {
      await server.addPlugin(plugin1);
      await server.addPlugin(plugin2);
      await server.addPlugin(plugin3);

      // Register a test tool
      server.tool(
        "calculate",
        "Calculate value",
        jsonSchema({
          type: "object",
          properties: {
            value: { type: "number" },
          },
          required: ["value"],
        }),
        (args: any) => {
          return {
            content: [{ type: "text", text: `Result: ${args.value}` }],
          };
        },
      );
    },
  );

  // Call the tool with value 5
  // Expected: (5 + 1) * 2 + 10 = 22
  const result = await server.callTool("calculate", { value: 5 }) as any;

  assertEquals(result.content[0].text, "Result: 22");
});

Deno.test("Runtime transformation - error handling", async () => {
  // Create a plugin that throws an error
  const faultyPlugin: ToolPlugin = {
    name: "faulty-transform",
    transformInput: (_args: any) => {
      throw new Error("Transform failed!");
    },
  };

  // Create server with plugin (need to capture logs)
  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [],
    async (server: ComposableMCPServer) => {
      await server.addPlugin(faultyPlugin);

      // Register a test tool
      server.tool(
        "test",
        "Test tool",
        jsonSchema({
          type: "object",
          properties: {
            data: { type: "string" },
          },
        }),
        (args: any) => {
          return {
            content: [{ type: "text", text: args.data || "default" }],
          };
        },
      );
    },
  );

  // Call should succeed even if plugin fails (continues with original args)
  const result = await server.callTool("test", { data: "test-data" }) as any;

  // Should return the original input since transform failed
  assertEquals(result.content[0].text, "test-data");
});
