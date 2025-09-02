import { OpenAPIHono } from "@hono/zod-openapi";
import { registerAgent } from "./controllers/register.ts";
import { mcpc } from "@mcpc/core";
import type { ComposableMCPServer } from "@mcpc/core";

export const createServer = async (): Promise<ComposableMCPServer> =>
  await mcpc(
    [
      {
        name: "capi-mcp",
        version: "0.1.0",
      },
      { capabilities: { tools: {}, sampling: {} } },
    ],
    // TODO: Move example tool definitions here or make configurable
    [],
  );

export const createApp = (): OpenAPIHono => {
  const app = new OpenAPIHono();

  // Register routes
  registerAgent(app);

  return app;
};
