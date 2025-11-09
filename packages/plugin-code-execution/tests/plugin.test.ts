/**
 * Basic tests for Code Execution Plugin
 */

import { assertEquals } from "@std/assert";
import { createCodeExecutionPlugin } from "../mod.ts";

Deno.test("Code execution plugin - exports correctly", () => {
  const plugin = createCodeExecutionPlugin();

  assertEquals(plugin.name, "code_execution");
  assertEquals(plugin.version, "1.0.0");
  assertEquals(plugin.apply, "custom");
  assertEquals(typeof plugin.registerAgentTool, "function");
});

Deno.test("Code execution plugin - accepts config options", () => {
  const plugin = createCodeExecutionPlugin({
    sandbox: {
      timeout: 60000,
      memoryLimit: 1024,
      permissions: ["--allow-net"],
    },
  });

  assertEquals(plugin.name, "code_execution");
  assertEquals(typeof plugin.registerAgentTool, "function");
});
