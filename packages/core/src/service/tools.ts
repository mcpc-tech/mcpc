import { z } from "zod";

const AutoApproveSchema: z.ZodDefault<z.ZodArray<z.ZodString, "many">> = z
  .array(z.string()).default([]);

const BaseConfigSchema: z.ZodObject<Record<string, z.ZodTypeAny>> = z.object({
  autoApprove: AutoApproveSchema.optional(),
  disabled: z.boolean().optional(),
  disabledReason: z.string().optional(),
  toolCallTimeout: z.number().optional(),
});

export const SseConfigSchema: z.ZodObject<Record<string, z.ZodTypeAny>> =
  BaseConfigSchema.extend({
    url: z.string().url(),
    transportType: z.literal("sse").optional(),
    headers: z.record(z.string()).optional(),
  });

export const StreamableHTTPSchema: z.ZodObject<Record<string, z.ZodTypeAny>> =
  BaseConfigSchema.extend({
    url: z.string().url(),
    transportType: z.literal("streamable-http").optional(),
    headers: z.record(z.string()).optional(),
  });

export const StdioConfigSchema: z.ZodObject<Record<string, z.ZodTypeAny>> =
  BaseConfigSchema.extend({
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    transportType: z.literal("stdio").optional(),
  });

export const InMemoryConfigSchema: z.ZodObject<Record<string, z.ZodTypeAny>> =
  BaseConfigSchema.extend({
    transportType: z.literal("memory"),
    server: z.any(), // Server instance from @modelcontextprotocol/sdk
  });

export const ServerConfigSchema: z.ZodTypeAny = z.union([
  StdioConfigSchema,
  SseConfigSchema,
  StreamableHTTPSchema,
  InMemoryConfigSchema,
]);

export const McpSettingsSchema: z.ZodObject<Record<string, z.ZodTypeAny>> = z
  .object({
    mcpServers: z.record(ServerConfigSchema),
  });

// Use the input types (pre-transform) so plain config objects in examples
// that don't include the added `transportType` property still type-check.
// Allow either the raw input (what users write in examples/configs) or the
// transformed/inferred type (which includes the added `transportType` fields).
export type McpServerConfig =
  | z.input<typeof ServerConfigSchema>
  | z.infer<typeof ServerConfigSchema>;
export type MCPSetting =
  | z.input<typeof McpSettingsSchema>
  | z.infer<typeof McpSettingsSchema>;
