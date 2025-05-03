import { OpenAPIHono } from "@hono/zod-openapi";
import { setUpMcpServer } from "./set-up-mcp-compose.ts";
import { registerAgent } from "./controllers/register.ts";

export const server = setUpMcpServer(
  {
    name: "capi-mcp",
    version: "0.1.0",
  },
  { capabilities: { tools: {} } }
);

export const createApp = () => {
  const app = new OpenAPIHono();
  // Register middleware
  // TODO: fix this, after enable it, will return none text/stream
  // app.use(loggingMiddleware());

  // Register routes
  registerAgent(app);

  return app;
};
