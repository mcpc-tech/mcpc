import { experimental_createMCPClient } from "ai";

import type { OpenAPIHono } from "@hono/zod-openapi";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { isProdEnv } from "../../mod.ts";

export enum ServerName {
  DIAGRAM = "diagram-thinker",
  OAPI = "oapi-invoker",
  CODE_RUNNER = "code-runner",
}

export type McpServerConfig = z.infer<typeof ServerConfigSchema>;

const AutoApproveSchema = z.array(z.string()).default([]);

const BaseConfigSchema = z.object({
  autoApprove: AutoApproveSchema.optional(),
  disabled: z.boolean().optional(),
  disabledReason: z.string().optional(),
  timeout: z.number().optional(),
});

const SseConfigSchema = BaseConfigSchema.extend({
  url: z.string().url(),
}).transform((config) => ({
  ...config,
  transportType: "sse" as const,
}));

export const StdioConfigSchema = BaseConfigSchema.extend({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
}).transform((config) => ({
  ...config,
  transportType: "stdio" as const,
}));

export const ServerConfigSchema = z.union([StdioConfigSchema, SseConfigSchema]);

export const McpSettingsSchema: z.ZodObject<{
  mcpServers: z.ZodRecord<
    z.ZodString,
    z.ZodUnion<[z.ZodType<any>, z.ZodType<any>]>
  >;
}> = z.object({
  mcpServers: z.record(ServerConfigSchema),
});
const configStr = readFileSync(
  new URL(
    `../../../../${isProdEnv() ? "mcp.json" : "mcp.local.json"}`,
    import.meta.url
  ),
  "utf-8"
);

const mcpSettings = McpSettingsSchema.parse(JSON.parse(configStr));
const mcpEnabledConfigs = Object.entries(mcpSettings.mcpServers).filter(
  ([name, config]) => {
    if (config.disabled) {
      return false;
    }
    return true;
  }
);

// Map to store dynamically imported server instances
const serverInstances: Record<string, any> = {};

/**
 * Dynamically imports a server module if it's enabled
 * @param serverName - The name of the server to import
 * @returns The server instance or null if disabled
 */
// async function importServerModule(serverName: string): Promise<any> {
//   if (serverInstances[serverName]) {
//     return serverInstances[serverName];
//   }

//   try {
//     switch (serverName) {
//       case ServerName.DIAGRAM: {
//         const diagramModule = await import("@mcpc/diagram-thinker-mcp");
//         serverInstances[serverName] = diagramModule.createApp();
//         break;
//       }
//       case ServerName.OAPI: {
//         const oapiModule = await import("@mcpc/oapi-invoker-mcp");
//         serverInstances[serverName] = oapiModule.createApp();
//         break;
//       }
//       case ServerName.CODE_RUNNER: {
//         const oapiModule = await import("@mcpc/code-runner-mcp");
//         serverInstances[serverName] = oapiModule.createApp();
//         break;
//       }
//       default: {
//         console.warn(`Unknown server name: ${serverName}`);
//         return null;
//       }
//     }
//     return serverInstances[serverName];
//   } catch (error) {
//     console.error(`Error importing module for ${serverName}:`, error);
//     return null;
//   }
// }

/**
 * Register MCP server routes to the app.
 * @param app - The OpenAPIHono instance.
 */
// export const registerMcpServer = async (app: OpenAPIHono) => {
//   try {
//     // Only import and register enabled servers
//     for (const [name, config] of mcpEnabledConfigs) {
//       const serverInstance = await importServerModule(name);
//       if (serverInstance) {
//         app.route(`/${name}`, serverInstance);
//       }
//     }
//   } catch (error) {
//     console.error("Error in registerMcpServer:", error);
//   }
// };

export async function getMcpClient(
  serverConfig: [string, z.infer<typeof ServerConfigSchema>]
) {
  const [_mcpName, mcpConfig] = serverConfig;
  const transport: any =
    mcpConfig.transportType === "sse"
      ? {
          type: "sse",
          url: mcpConfig.url,
          headers: {},
        }
      : {
          type: "stdio",
          command: mcpConfig.command!,
          args: mcpConfig.args || [],
          env: mcpConfig.env || {},
        };
  const client = await experimental_createMCPClient({
    transport,
  });
  return client;
}

export async function augmentAI() {
  const clients = await Promise.all(mcpEnabledConfigs.map(getMcpClient));
  const toolArrays = await Promise.all(
    clients.flatMap((client) => client.tools())
  );
  console.log(
    `[connected tools]: ${toolArrays
      .flatMap((tool) => Object.keys(tool))
      .join(", ")}`
  );
  return toolArrays.reduce(
    (tools, tool) => ({
      ...tools,
      ...tool,
    }),
    {}
  );
}
