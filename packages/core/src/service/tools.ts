import { experimental_createMCPClient } from "ai";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { isProdEnv } from "../../mod.ts";

export enum ServerName {
  DIAGRAM = "diagram-thinker",
  OAPI = "oapi-invoker",
  CODE_RUNNER = "code-runner",
}

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

export type McpServerConfig = z.infer<typeof ServerConfigSchema>;

const mcpSettings = McpSettingsSchema.parse(JSON.parse(configStr));
const mcpEnabledConfigs = Object.entries(mcpSettings.mcpServers).filter(
  ([name, config]) => {
    if (config.disabled) {
      return false;
    }
    return true;
  }
);

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

