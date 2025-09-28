import { OpenAPIHono } from "@hono/zod-openapi";
import { registerAgent } from "./controllers/register.ts";
import { mcpc } from "@mcpc/core";
import type { ComposableMCPServer } from "@mcpc/core";

export const createServer = async (): Promise<ComposableMCPServer> =>
  await mcpc(
    [
      {
        name: "large-result-plugin-example",
        version: "0.1.0",
      },
      { capabilities: { tools: {}, sampling: {} } },
    ],
    [
      {
        name: null,
        description: "",
        plugins: ["./plugins/large-result.ts?maxSize=8000&previewSize=4000"],
      },
    ],
  );

export const createApp = (): OpenAPIHono => {
  const app = new OpenAPIHono();

  // Register routes
  registerAgent(app);

  return app;
};
