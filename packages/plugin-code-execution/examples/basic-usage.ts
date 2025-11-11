/**
 * Basic Usage Example
 *
 * This example demonstrates how to use the code execution plugin with MCPC.
 *
 * Key points:
 * - Import and use the codeExecutionPlugin
 * - Set mode to "code_execution"
 * - Progressive tool disclosure pattern
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type ComposeDefinition, mcpc } from "@mcpc/core";
import { createCodeExecutionPlugin } from "@mcpc/plugin-code-execution/plugin";

const toolDefinitions: ComposeDefinition[] = [
  {
    name: "sandbox-agent",
    description: `A secure code execution agent using Deno sandbox.

Available tools:
<tool name="desktop-commander.read_file"/>
<tool name="desktop-commander.write_file"/>
<tool name="desktop-commander.list_directory"/>

I can execute JavaScript code securely in a sandboxed environment.
The code can call MCP tools via \`callMCPTool(toolName, params)\` function.`,
    deps: {
      mcpServers: {
        "desktop-commander": {
          command: "npx",
          args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
          transportType: "stdio" as const,
        },
      },
    },
    plugins: [
      createCodeExecutionPlugin({
        sandbox: {
          permissions: [],
        },
      }),
    ],
    options: {
      mode: "code_execution" as const,
    },
  },
];

// Create server with code execution plugin
const server = await mcpc(
  [
    {
      name: "sandbox-demo",
      version: "1.0.0",
    },
    {
      capabilities: { tools: {} },
    },
  ],
  toolDefinitions,
);

const transport = new StdioServerTransport();
await server.connect(transport);
