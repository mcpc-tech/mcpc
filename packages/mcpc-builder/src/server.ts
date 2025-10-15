/**
 * MCPC Builder MCP Server
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { toolDefinitions } from "./tools.ts";
import { handleToolCall } from "./handlers.ts";

export function createServer(): Server {
  const server = new Server(
    {
      name: "mcpc-builder",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, () => {
    return {
      tools: toolDefinitions,
    };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, handleToolCall);

  return server;
}
