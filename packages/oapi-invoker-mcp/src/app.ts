import { OpenAPIHono } from "@hono/zod-openapi";
import { registerAgent } from "./controllers/register.ts";
import { setUpMcpServer } from "./set-up-mcp.ts";
import { ComposableMCPServer } from "@mcpc/core";

export const server: ComposableMCPServer = setUpMcpServer(
  {
    name: "oapi-invoker-mcp",
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
