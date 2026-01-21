/**
 * Test for Code Execution Plugin
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { mcpcLegacy as mcpc } from "@mcpc/core";
import { createCodeExecutionPlugin } from "../mod.ts";

Deno.test(
  "Code execution plugin - execute simple code",
  async () => {
    const server = await mcpc(
      [
        { name: "test-code-exec", version: "1.0.0" },
        {
          capabilities: { tools: {} },
        },
      ],
      [
        {
          name: "test-agent",
          description: "Test agent",
          deps: { mcpServers: {} },
          plugins: [createCodeExecutionPlugin()],
          options: {
            mode: "code_execution",
          },
        },
      ],
    );

    try {
      const result: any = await server.callTool("test-agent", {
        code: "2 + 2",
        hasDefinitions: ["test-code-execq"],
      });

      assertEquals(result.isError, undefined);
      assertEquals(result.content.length > 0, true);
    } finally {
      await server.close?.();
      await new Promise((r) => setTimeout(r, 1000));
    }
  },
);

Deno.test(
  "Code execution plugin - execute code with calculations",
  async () => {
    const server = await mcpc(
      [
        { name: "test-code-exec", version: "1.0.0" },
        {
          capabilities: { tools: {} },
        },
      ],
      [
        {
          name: "test-agent",
          description: "Test agent",
          deps: { mcpServers: {} },
          plugins: [createCodeExecutionPlugin()],
          options: {
            mode: "code_execution",
          },
        },
      ],
    );

    try {
      const result: any = await server.callTool("test-agent", {
        code: "const sum = 1 + 2; sum",
        hasDefinitions: [],
      });

      assertEquals(result.isError, undefined);
      assertEquals(result.content.length > 0, true);
    } finally {
      await server.close?.();
      await new Promise((r) => setTimeout(r, 1000));
    }
  },
);

Deno.test(
  "Code execution plugin - handle errors",
  async () => {
    const server = await mcpc(
      [
        { name: "test-code-exec", version: "1.0.0" },
        {
          capabilities: { tools: {} },
        },
      ],
      [
        {
          name: "test-agent",
          description: "Test agent",
          deps: { mcpServers: {} },
          plugins: [createCodeExecutionPlugin()],
          options: {
            mode: "code_execution",
          },
        },
      ],
    );

    try {
      const result: any = await server.callTool("test-agent", {
        code: "throw new Error('Test error');",
        hasDefinitions: [],
      });

      // Either result is an error or content contains error message
      if (result.isError) {
        assertEquals(result.isError, true);
      } else {
        assertStringIncludes(
          String(result.content[0].text).toLowerCase(),
          "error",
        );
      }
    } finally {
      await server.close?.();
      await new Promise((r) => setTimeout(r, 1000));
    }
  },
);
