import { OpenAPIHono } from "@hono/zod-openapi";
import { registerAgent } from "./controllers/register.ts";
import { mcpc } from "@mcpc/core";
import type { ComposableMCPServer } from "@mcpc/core";
import type { MCPCConfig } from "./config/loader.ts";
import {
  DEFAULT_SKILLS_PATHS,
  getDefaultAgents,
  getGlobalPlugins,
} from "./defaults.ts";

export const createServer = async (
  config?: MCPCConfig,
): Promise<ComposableMCPServer> => {
  const serverConfig = config || {
    name: "mcpc-server",
    version: "0.1.0",
    skills: DEFAULT_SKILLS_PATHS,
    agents: getDefaultAgents(),
  };

  const skillsPaths = serverConfig.skills || DEFAULT_SKILLS_PATHS;

  return await mcpc(
    [
      {
        name: serverConfig.name || "mcpc-server",
        version: serverConfig.version || "0.1.0",
      },
      {
        capabilities: serverConfig.capabilities || { tools: {}, logging: {} },
      },
    ],
    serverConfig.agents,
    { plugins: getGlobalPlugins(skillsPaths) },
  );
};

export const createApp = (config?: MCPCConfig): OpenAPIHono => {
  const app = new OpenAPIHono();
  registerAgent(app, config);
  return app;
};
