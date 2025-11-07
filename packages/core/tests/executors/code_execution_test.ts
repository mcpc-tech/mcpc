/**
 * Test for Code Execution Mode
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { mcpc } from "../../mod.ts";

Deno.test("Code execution mode - search tools with keyword", async () => {
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
    action: "search_tools",
    keyword: "test",
    decision: "proceed",
  });

  assertEquals(result.isError, undefined);
  assertStringIncludes(
    String(result.content[0].text),
    "Found",
  );
});

Deno.test("Code execution mode - list all tools (empty keyword)", async () => {
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
    action: "search_tools",
    keyword: "",
    decision: "proceed",
  });

  assertEquals(result.isError, undefined);
  assertStringIncludes(
    String(result.content[0].text),
    "Found",
  );
});

Deno.test("Code execution mode - execute simple code", async () => {
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
    action: "execute_code",
    code: "console.log('Hello from code execution!'); return 42;",
    decision: "proceed",
  });

  assertEquals(result.isError, undefined);
  assertStringIncludes(
    String(result.content[0].text),
    "Hello from code execution!",
  );
  assertStringIncludes(String(result.content[0].text), "42");
});

Deno.test("Code execution mode - execute code with calculations", async () => {
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
    action: "execute_code",
    code: `
      const numbers = [1, 2, 3, 4, 5];
      const sum = numbers.reduce((a, b) => a + b, 0);
      const avg = sum / numbers.length;
      console.log(\`Sum: \${sum}, Average: \${avg}\`);
      return { sum, avg };
    `,
    decision: "proceed",
  });

  assertEquals(result.isError, undefined);
  assertStringIncludes(String(result.content[0].text), "Sum: 15");
  assertStringIncludes(String(result.content[0].text), "Average: 3");
  assertStringIncludes(String(result.content[0].text), '"sum": 15');
  assertStringIncludes(String(result.content[0].text), '"avg": 3');
});

Deno.test("Code execution mode - handle syntax errors", async () => {
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
    action: "execute_code",
    code: "const x = ; // Syntax error",
    decision: "proceed",
  });

  assertEquals(result.isError, true);
  assertStringIncludes(String(result.content[0].text), "error");
});

Deno.test("Code execution mode - complete decision", async () => {
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
    action: "execute_code",
    decision: "complete",
  });

  assertEquals(result.isError, undefined);
  assertStringIncludes(String(result.content[0].text), "completed");
});
