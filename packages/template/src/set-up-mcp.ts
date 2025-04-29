import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const INCOMING_MSG_ROUTE_PATH = "/template/messages";

export function setUpMcpServer(
  ...args: ConstructorParameters<typeof McpServer>
): InstanceType<typeof McpServer> {
  const server = new McpServer(...args);

  server.tool(
    "echo tool",
    "Echo back what user said",
    {
      code: z.string().describe("string needs to be echoed"),
    },
    async (inputParams, extra) => {
      return {
        content: [
          {
            type: "text",
            text: `hello👋 ${inputParams.code}`,
          },
        ],
      };
    }
  );

  return server;
}
