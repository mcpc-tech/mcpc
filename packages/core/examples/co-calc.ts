import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mcpc } from "../mod.ts";

export const server = await mcpc(
  [
    {
      name: "mcpc",
      version: "0.1.0",
    },
    { capabilities: { tools: { listChanged: true } } },
  ],
  [
    {
      name: "co-calculator",
      description: `When mathematical statistics or logical calculations are needed, complete the calculation by following these steps:
1. Use <tool name="code-runner.python-code-runner"/> to execute the calculation code
2. Return the calculation result.`,
      deps: {
        mcpServers: {
          "code-runner": {
            command: "deno",
            args: ["run", "--allow-all", "jsr:@mcpc/code-runner-mcp/bin"],
            env: {},
            transportType: "stdio",
          },
        },
      },
    },
  ]
);

const transport = new StdioServerTransport();
await server.connect(transport);
