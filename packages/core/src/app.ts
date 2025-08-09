import { OpenAPIHono } from "@hono/zod-openapi";
import { registerAgent } from "./controllers/register.ts";
import { mcpc } from "./set-up-mcp-compose.ts";
import { toolDefinitions } from "../examples/sampling/01-basic-composition.ts";

export const server = await mcpc([
  {
    name: "capi-mcp",
    version: "0.1.0",
  },
  { capabilities: { tools: {}, sampling: {} } },
], toolDefinitions);

export const createApp = () => {
  const app = new OpenAPIHono();
  
  // Register routes
  registerAgent(app);

  return app;
};
