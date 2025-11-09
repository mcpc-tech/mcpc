/**
 * Test for Code Execution Plugin
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { mcpc } from "@mcpc/core";
import { createCodeExecutionPlugin } from "../mod.ts";

Deno.test("Code execution plugin - get tool definitions", async () => {
  const server = await mcpc(
    [{ name: "test-code-exec", version: "1.0.0" }, {
      capabilities: { tools: {} },
    }],
    [{
      name: "test-agent",
      description: "Test agent",
      deps: { mcpServers: {} },
      plugins: [createCodeExecutionPlugin()],
    }],
  );

  const result: any = await server.callTool("test-agent", {
    definitionsOf: ["io_github_wonderwhy-er_desktop-commander_read_file"],
  });

  assertEquals(result.isError, undefined);
  assertStringIncludes(
    String(result.content[0].text),
    "io_github_wonderwhy-er_desktop-commander_read_file",
  );
});

Deno.test("Code execution plugin - execute simple code", async () => {
  const server = await mcpc(
    [{ name: "test-code-exec", version: "1.0.0" }, {
      capabilities: { tools: {} },
    }],
    [{
      name: "test-agent",
      description: "Test agent",
      deps: { mcpServers: {} },
      plugins: [createCodeExecutionPlugin()],
    }],
  );

  const result: any = await server.callTool("test-agent", {
    code: "console.log('Hello from code execution!');",
    hasDefinitions: ["io_github_wonderwhy-er_desktop-commander_read_file"],
  });

  assertEquals(result.isError, undefined);
  assertStringIncludes(
    String(result.content[0].text),
    "Hello from code execution!",
  );
});

Deno.test("Code execution plugin - execute code with calculations", async () => {
  const server = await mcpc(
    [{ name: "test-code-exec", version: "1.0.0" }, {
      capabilities: { tools: {} },
    }],
    [{
      name: "test-agent",
      description: "Test agent",
      deps: { mcpServers: {} },
      plugins: [createCodeExecutionPlugin()],
    }],
  );

  const result: any = await server.callTool("test-agent", {
    code: `
      const numbers = [1, 2, 3, 4, 5];
      const sum = numbers.reduce((a, b) => a + b, 0);
      const avg = sum / numbers.length;
      console.log(\`Sum: \${sum}, Average: \${avg}\`);
    `,
    hasDefinitions: ["io_github_wonderwhy-er_desktop-commander_read_file"],
  });

  assertEquals(result.isError, undefined);
  assertStringIncludes(String(result.content[0].text), "Sum: 15");
  assertStringIncludes(String(result.content[0].text), "Average: 3");
});

Deno.test("Code execution plugin - handle syntax errors", async () => {
  const server = await mcpc(
    [{ name: "test-code-exec", version: "1.0.0" }, {
      capabilities: { tools: {} },
    }],
    [{
      name: "test-agent",
      description: "Test agent",
      deps: { mcpServers: {} },
      plugins: [createCodeExecutionPlugin()],
    }],
  );

  const result: any = await server.callTool("test-agent", {
    code: "const x = ; // Syntax error",
    hasDefinitions: ["io_github_wonderwhy-er_desktop-commander_read_file"],
  });

  assertEquals(result.isError, true);
  assertStringIncludes(String(result.content[0].text).toLowerCase(), "error");
});

Deno.test("Code execution plugin - execute and get new definitions", async () => {
  const server = await mcpc(
    [{ name: "test-code-exec", version: "1.0.0" }, {
      capabilities: { tools: {} },
    }],
    [{
      name: "test-agent",
      description: "Test agent",
      deps: { mcpServers: {} },
      plugins: [createCodeExecutionPlugin()],
    }],
  );

  const result: any = await server.callTool("test-agent", {
    code: "console.log('Executing code');",
    hasDefinitions: ["io_github_wonderwhy-er_desktop-commander_read_file"],
    definitionsOf: ["io_github_wonderwhy-er_desktop-commander_write_file"],
  });

  assertEquals(result.isError, undefined);
  assertStringIncludes(
    String(result.content[0].text),
    "Executing code",
  );
  assertStringIncludes(
    String(result.content[0].text),
    "io_github_wonderwhy-er_desktop-commander_write_file",
  );
});

Deno.test("Code execution plugin - validation: code without hasDefinitions fails", async () => {
  const server = await mcpc(
    [{ name: "test-code-exec", version: "1.0.0" }, {
      capabilities: { tools: {} },
    }],
    [{
      name: "test-agent",
      description: "Test agent",
      deps: { mcpServers: {} },
      plugins: [createCodeExecutionPlugin()],
    }],
  );

  const result: any = await server.callTool("test-agent", {
    code: "console.log('test');",
  });

  assertEquals(result.isError, true);
  assertStringIncludes(String(result.content[0].text), "hasDefinitions");
});
