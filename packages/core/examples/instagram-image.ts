import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ComposeDefination, mcpc } from "../mod.ts";
import { insImageGen as insImageGen } from "./def.ts";

export const server = await mcpc(
  [
    {
      name: "mcpc",
      version: "0.1.0",
    },
    { capabilities: { tools: { listChanged: true } } },
  ],
  [insImageGen]
);

const transport = new StdioServerTransport();
await server.connect(transport);
