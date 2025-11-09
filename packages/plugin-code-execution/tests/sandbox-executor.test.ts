/**
 * Tests for SandboxExecutor
 */

import { assertEquals, assertExists } from "@std/assert";
import { SandboxExecutor } from "../src/sandbox-executor.ts";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

Deno.test("SandboxExecutor - initialization", () => {
  const executor = new SandboxExecutor();

  assertExists(executor);

  // Cleanup
  executor.stop();
});

Deno.test("SandboxExecutor - execute simple code", async () => {
  const executor = new SandboxExecutor(
    { timeout: 5000 },
    (_toolName: string, _params: unknown): Promise<CallToolResult> => {
      return Promise.resolve({
        content: [{ type: "text", text: "Tool result" }],
      });
    },
  );

  executor.start();

  const result = await executor.executeCode(
    "console.log('Hello from sandbox'); return 42;",
    [],
  );

  console.log("Execution result:", result);

  assertEquals(result.isError, undefined);
  assertExists(result.content);
  assertEquals(result.content.length, 1);

  // Cleanup
  executor.stop();

  // Wait for cleanup to complete
  await new Promise((resolve) => setTimeout(resolve, 200));
});

Deno.test("SandboxExecutor - handle execution errors", async () => {
  const executor = new SandboxExecutor(
    { timeout: 5000 },
    (_toolName: string, _params: unknown): Promise<CallToolResult> => {
      return Promise.resolve({
        content: [{ type: "text", text: "Tool result" }],
      });
    },
  );

  executor.start();

  const result = await executor.executeCode(
    "throw new Error('Test error');",
    [],
  );

  console.log("Execution result:", result);

  assertEquals(result.isError, true);
  assertExists(result.content);

  // Cleanup
  executor.stop();

  // Wait for cleanup to complete
  await new Promise((resolve) => setTimeout(resolve, 200));
});

Deno.test("SandboxExecutor - stop sandbox", () => {
  const executor = new SandboxExecutor();

  executor.start();

  executor.stop();

  // Should not throw
  executor.stop();
});
