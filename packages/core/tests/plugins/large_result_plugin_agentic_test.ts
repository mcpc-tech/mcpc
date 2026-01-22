import { mcpc } from "../../mod.ts";
import { jsonSchema } from "../../src/utils/schema.ts";
import type { ComposeDefinition } from "../../src/set-up-mcp-compose.ts";
import type { ComposableMCPServer } from "../../src/compose.ts";
import { assertEquals } from "@std/assert";

interface ToolResult {
  content?: { type: string; text: string }[];
}

/**
 * Test that large-result plugin works correctly when tools are called
 * via agentic executor (through the agent tool), not just via direct callTool.
 *
 * This test verifies the fix for the bug where transformTool hooks were not
 * applied to tools executed through agentic executor.
 */
Deno.test("large-result plugin intercepts via agentic executor", async () => {
  const server = await mcpc(
    [
      { name: "large-demo", version: "1.0.0" },
      { capabilities: { tools: { listChanged: true } } },
    ],
    [
      {
        name: "large-output-handler",
        description: "Agent that demonstrates automatic large output handling",
        plugins: [
          "./plugins/large-result.ts?maxSize=300&previewSize=150",
        ],
      } as ComposeDefinition,
    ],
    (server: ComposableMCPServer) => {
      server.tool(
        "make-big-text",
        "Create large text output",
        jsonSchema<{ lines?: number }>({
          type: "object",
          properties: {
            lines: {
              type: "number",
              description: "How many lines to generate",
            },
          },
        }),
        (args) => {
          const lines = (args as { lines?: number }).lines || 500;
          let text = "";
          for (let i = 1; i <= lines; i++) {
            text += `Line ${i}: Some example text here\n`;
          }
          return { content: [{ type: "text" as const, text }] };
        },
        { internal: true },
      );
    },
  );

  // Test 1: Direct callTool should be intercepted
  const directResult = (await server.callTool("make-big-text", {
    lines: 10,
  })) as ToolResult;
  const directText = directResult?.content?.find((c) => c.type === "text")
    ?.text || "";

  assertEquals(
    directText.includes("Result too large"),
    true,
    "Direct callTool should be intercepted by large-result plugin",
  );

  // Test 2: Call via agentic executor should also be intercepted
  const agentResult = (await server.callTool("large-output-handler", {
    tool: "make-big-text",
    args: { lines: 10 },
  })) as ToolResult;
  const agentText = agentResult?.content?.find((c) => c.type === "text")
    ?.text || "";

  assertEquals(
    agentText.includes("Result too large"),
    true,
    "Call via agentic executor should be intercepted by large-result plugin",
  );

  // Cleanup - allow any pending timers to complete
  await new Promise((r) => setTimeout(r, 10));
});

Deno.test("large-result plugin does not intercept small results via agentic", async () => {
  const server = await mcpc(
    [
      { name: "small-demo", version: "1.0.0" },
      { capabilities: { tools: { listChanged: true } } },
    ],
    [
      {
        name: "small-output-handler",
        description: "Agent for testing small output",
        plugins: [
          "./plugins/large-result.ts?maxSize=300&previewSize=150",
        ],
      } as ComposeDefinition,
    ],
    (server: ComposableMCPServer) => {
      server.tool(
        "make-small-text",
        "Create small text output",
        jsonSchema<{ lines?: number }>({
          type: "object",
          properties: {
            lines: {
              type: "number",
              description: "How many lines to generate",
            },
          },
        }),
        (args) => {
          const lines = (args as { lines?: number }).lines || 3;
          let text = "";
          for (let i = 1; i <= lines; i++) {
            text += `Line ${i}: Short\n`;
          }
          return { content: [{ type: "text" as const, text }] };
        },
        { internal: true },
      );
    },
  );

  // Call via agentic executor with small output (should NOT be intercepted)
  const agentResult = (await server.callTool("small-output-handler", {
    tool: "make-small-text",
    args: { lines: 3 },
  })) as ToolResult;
  const agentText = agentResult?.content?.find((c) => c.type === "text")
    ?.text || "";

  assertEquals(
    agentText.includes("Result too large"),
    false,
    "Small results should not be intercepted by large-result plugin",
  );

  assertEquals(
    agentText.includes("Line 1:"),
    true,
    "Small results should return original content",
  );

  // Cleanup
  await new Promise((r) => setTimeout(r, 10));
});
