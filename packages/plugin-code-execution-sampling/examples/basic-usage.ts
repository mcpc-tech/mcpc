/**
 * Basic Usage Example for `code_execution_sampling`
 *
 * Start this server, then connect with any MCP client that advertises
 * sampling support. The client can call the `sampling-sandbox-agent`
 * tool with either:
 *
 * - `{ tool: "man", args: { tools: ["add"] } }`
 * - `{ tool: "exec", args: { code: "..." } }`
 *
 * Inside sandboxed JavaScript you can:
 * - call deterministic MCP tools with `tool(toolName, params)`
 * - call the connected client's model with `sampling(prompt, outputSchema)`
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type ComposeDefinition, jsonSchema, mcpc } from "@mcpc/core";
import { createCodeExecutionSamplingPlugin } from "../mod.ts";

const toolDefinitions: ComposeDefinition[] = [
  {
    name: "sampling-sandbox-agent",
    description:
      `A secure sandbox agent that can execute JavaScript and ask the connected MCP client's model for help.

Available tools:
<tool name="add"/>
<tool name="get_project_fact"/>

Suggested workflow:
1. Use \`tool: "man"\` first to inspect tool schemas.
2. Use \`tool: "exec"\` to run JavaScript in the sandbox.
3. Inside the sandbox, use \`tool(...)\` for deterministic work.
4. Use \`sampling(...)\` when you want the connected client's model to reason or orchestrate tool calls.`,
    deps: { mcpServers: {} },
    plugins: [
      createCodeExecutionSamplingPlugin({
        sandbox: {
          permissions: [],
          timeout: 30_000,
        },
        sampling: {
          maxSteps: 6,
          maxTokens: 2048,
        },
      }),
    ],
    options: {
      mode: "code_execution_sampling" as const,
    },
  },
];

const server = await mcpc(
  [
    {
      name: "code-execution-sampling-demo",
      version: "1.0.0",
    },
    {
      capabilities: { tools: {} },
    },
  ],
  toolDefinitions,
  {
    setup: (server) => {
      server.tool(
        "add",
        "Add two numbers.",
        jsonSchema<{ a: number; b: number }>({
          type: "object",
          properties: {
            a: { type: "number" },
            b: { type: "number" },
          },
          required: ["a", "b"],
        }),
        ({ a, b }: { a: number; b: number }) => ({
          content: [{ type: "text" as const, text: String(a + b) }],
        }),
        { internal: true },
      );

      server.tool(
        "get_project_fact",
        "Return one short fact about this demo project.",
        jsonSchema<Record<string, never>>({
          type: "object",
          properties: {},
          additionalProperties: false,
        }),
        () => ({
          content: [
            {
              type: "text" as const,
              text:
                "This demo shows how sandboxed JavaScript can combine direct MCP tool calls with MCP sampling-backed model calls.",
            },
          ],
        }),
        { internal: true },
      );
    },
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

const sampleCode = `const direct = await tool("add", { a: 20, b: 22 });
console.log("Direct tool result:", JSON.stringify(direct));

const { data, error } = await sampling(
  "Compute 20 + 22 using the add tool, then return the result",
  { result: "number", explanation: "string" }
);
console.log("Sampling result:", JSON.stringify({ data, error }));`;

console.error("🚀 code_execution_sampling example server running on stdio");
console.error("Call tool: sampling-sandbox-agent");
console.error("Suggested first request:");
console.error(
  JSON.stringify(
    {
      tool: "exec",
      args: {
        code: sampleCode,
      },
    },
    null,
    2,
  ),
);
