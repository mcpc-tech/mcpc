/**
 * Test for Code Execution Mode
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { mcpc } from "../../mod.ts";

Deno.test("Code execution mode - get tool definitions", async () => {
  const server = await mcpc(
    [{ name: "test-code-exec", version: "1.0.0" }, {
      capabilities: { tools: {} },
    }],
    [{
      name: "test-agent",
      description: "Test agent with <tool name='test-tool'/>",
      deps: {
        mcpServers: {},
      },
      options: {
        mode: "code_execution",
      },
    }],
  );

  // Add a test tool
  server.tool(
    "test-tool",
    "Test tool",
    { type: "object", properties: {} },
    () => {
      return { content: [{ type: "text", text: "Test result" }] };
    },
  );

  const result: any = await server.callTool("test-agent", {
    definitionsOf: ["test-tool"],
  });

  assertEquals(result.isError, undefined);
  assertStringIncludes(
    String(result.content[0].text),
    "test-tool",
  );
});

Deno.test("Code execution mode - execute simple code", async () => {
  const server = await mcpc(
    [{ name: "test-code-exec", version: "1.0.0" }, {
      capabilities: { tools: {} },
    }],
    [{
      name: "test-agent",
      description: "Test agent with <tool name='test-tool'/>",
      deps: {
        mcpServers: {},
      },
      options: {
        mode: "code_execution",
      },
    }],
  );

  // Add a test tool
  server.tool(
    "test-tool",
    "Test tool",
    { type: "object", properties: {} },
    () => {
      return { content: [{ type: "text", text: "Test result" }] };
    },
  );

  const result: any = await server.callTool("test-agent", {
    code: "console.log('Hello from code execution!'); return 42;",
    hasDefinitions: ["test-tool"],
  });

  assertEquals(result.isError, undefined);
  assertStringIncludes(
    String(result.content[0].text),
    "Hello from code execution!",
  );
});

Deno.test("Code execution mode - execute code with calculations", async () => {
  const server = await mcpc(
    [{ name: "test-code-exec", version: "1.0.0" }, {
      capabilities: { tools: {} },
    }],
    [{
      name: "test-agent",
      description: "Test agent with <tool name='test-tool'/>",
      deps: {
        mcpServers: {},
      },
      options: {
        mode: "code_execution",
      },
    }],
  );

  // Add a test tool
  server.tool(
    "test-tool",
    "Test tool",
    { type: "object", properties: {} },
    () => {
      return { content: [{ type: "text", text: "Test result" }] };
    },
  );

  const result: any = await server.callTool("test-agent", {
    code: `
      const numbers = [1, 2, 3, 4, 5];
      const sum = numbers.reduce((a, b) => a + b, 0);
      const avg = sum / numbers.length;
      console.log(\`Sum: \${sum}, Average: \${avg}\`);
      return { sum, avg };
    `,
    hasDefinitions: ["test-tool"],
  });

  assertEquals(result.isError, undefined);
  assertStringIncludes(String(result.content[0].text), "Sum: 15");
  assertStringIncludes(String(result.content[0].text), "Average: 3");
});

Deno.test("Code execution mode - handle syntax errors", async () => {
  const server = await mcpc(
    [{ name: "test-code-exec", version: "1.0.0" }, {
      capabilities: { tools: {} },
    }],
    [{
      name: "test-agent",
      description: "Test agent with <tool name='test-tool'/>",
      deps: {
        mcpServers: {},
      },
      options: {
        mode: "code_execution",
      },
    }],
  );

  // Add a test tool
  server.tool(
    "test-tool",
    "Test tool",
    { type: "object", properties: {} },
    () => {
      return { content: [{ type: "text", text: "Test result" }] };
    },
  );

  const result: any = await server.callTool("test-agent", {
    code: "const x = ; // Syntax error",
    hasDefinitions: ["test-tool"],
  });

  assertEquals(result.isError, true);
  assertStringIncludes(String(result.content[0].text).toLowerCase(), "error");
});

Deno.test("Code execution mode - execute and get new definitions", async () => {
  const server = await mcpc(
    [{ name: "test-code-exec", version: "1.0.0" }, {
      capabilities: { tools: {} },
    }],
    [{
      name: "test-agent",
      description:
        "Test agent with <tool name='test-tool'/> and <tool name='another-tool'/>",
      deps: {
        mcpServers: {},
      },
      options: {
        mode: "code_execution",
      },
    }],
  );

  // Add test tools
  server.tool(
    "test-tool",
    "Test tool",
    { type: "object", properties: {} },
    () => {
      return { content: [{ type: "text", text: "Test result" }] };
    },
  );
  server.tool("another-tool", "Another tool", {
    type: "object",
    properties: {},
  }, () => {
    return { content: [{ type: "text", text: "Another result" }] };
  });

  const result: any = await server.callTool("test-agent", {
    code: "console.log('Executing with test-tool');",
    hasDefinitions: ["test-tool"],
    definitionsOf: ["another-tool"],
  });

  assertEquals(result.isError, undefined);
  assertStringIncludes(
    String(result.content[0].text),
    "Executing with test-tool",
  );
  // Should also include the definitions for another-tool
  assertStringIncludes(String(result.content[0].text), "another-tool");
});

Deno.test("Code execution mode - validation: code without hasDefinitions fails", async () => {
  const server = await mcpc(
    [{ name: "test-code-exec", version: "1.0.0" }, {
      capabilities: { tools: {} },
    }],
    [{
      name: "test-agent",
      description: "Test agent",
      deps: {
        mcpServers: {},
      },
      options: {
        mode: "code_execution",
      },
    }],
  );

  const result: any = await server.callTool("test-agent", {
    code: "console.log('test');",
    // Missing hasDefinitions - should fail validation
  });

  assertEquals(result.isError, true);
  assertStringIncludes(String(result.content[0].text), "Validation failed");
});
