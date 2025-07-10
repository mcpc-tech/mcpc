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
      name: "diagram",
      description: `Generate a diagram.`,
      // deps: {
      //   mcpServers: {
      //     g: {
      //       transportType: "stdio",
      //       command: "npx",
      //       args: ["-y", "@jsr2npm/yao__gpt-vis-mcp@0.0.4"],
      //     },
      //   },
      // },
    },
  ],
);

const transport = new StdioServerTransport();
await server.connect(transport);
