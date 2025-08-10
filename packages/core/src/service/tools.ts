import { z } from "zod";

const AutoApproveSchema = z.array(z.string()).default([]);

const BaseConfigSchema = z.object({
  autoApprove: AutoApproveSchema.optional(),
  disabled: z.boolean().optional(),
  disabledReason: z.string().optional(),
  timeout: z.number().optional(),
});

export const SseConfigSchema = BaseConfigSchema.extend({
  url: z.string().url(),
}).transform((config) => ({
  ...config,
  transportType: "sse" as const,
}));

export const StreamableHTTPSchema = BaseConfigSchema.extend({
  url: z.string().url(),
}).transform((config) => ({
  ...config,
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

export type McpServerConfig = z.infer<typeof ServerConfigSchema>;
export type MCPSetting = z.infer<typeof McpSettingsSchema>;
