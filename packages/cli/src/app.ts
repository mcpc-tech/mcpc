import { OpenAPIHono } from "@hono/zod-openapi";
import { registerAgent } from "./controllers/register.ts";
import { mcpc } from "@mcpc/core";
import { createLargeResultPlugin } from "@mcpc/core/plugins/large-result";
import type { ComposableMCPServer, ComposeDefinition } from "@mcpc/core";
import type { MCPCConfig } from "./config/loader.ts";
import { codeExecutionPlugin } from "@mcpc-tech/plugin-code-execution";

export const createServer = async (
  config?: MCPCConfig,
): Promise<ComposableMCPServer> => {
  // Use provided config or fall back to default example config
  const serverConfig = config || {
    name: "mcpc-server",
    version: "0.1.0",
    agents: [
      {
        name: null,
        description: "",
        plugins: [createLargeResultPlugin({}), codeExecutionPlugin],
        options: {
          mode: "code_execution",
        },
      },
    ] as ComposeDefinition[],
  };

  return await mcpc(
    [
      {
        name: serverConfig.name || "mcpc-server",
        version: serverConfig.version || "0.1.0",
      },
      {
        capabilities: (serverConfig?.capabilities || {
          tools: {},
          logging: {},
        }),
      },
    ],
    serverConfig.agents,
  );
};

export const createApp = (config?: MCPCConfig): OpenAPIHono => {
  const app = new OpenAPIHono();

  // Register routes with config
  registerAgent(app, config);

  return app;
};
