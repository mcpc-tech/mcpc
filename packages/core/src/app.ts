import { OpenAPIHono } from "@hono/zod-openapi";
import { registerAgent } from "./controllers/register.ts";
import { mcpc } from "./set-up-mcp-compose.ts";

export const server = await mcpc([
  {
    name: "capi-mcp",
    version: "0.1.0",
  },
  { capabilities: { tools: { listChanged: true } } },
]);

export const createApp = () => {
  const app = new OpenAPIHono();
  // Register middleware
  // TODO: fix this, after enable it, will return none text/stream
  // app.use(loggingMiddleware());

  // Register routes
  registerAgent(app);

  return app;
};
