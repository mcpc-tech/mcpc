import { OpenAPIHono } from "@hono/zod-openapi";
import { registerAgent } from "./controllers/register.ts";
import { setUpMcpServer } from "./set-up-mcp.ts";
import { McpServer } from "@modelcontextprotocol/sdk";

export const server: McpServer = setUpMcpServer(
  {
    name: "code-runner-mcp",
    version: "0.1.0",
  },
  { capabilities: { tools: {} } }
);

export const createApp: () => OpenAPIHono = () => {
  const app = new OpenAPIHono();

  // Register routes
  registerAgent(app);

  return app;
};
