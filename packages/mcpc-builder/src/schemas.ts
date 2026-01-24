/**
 * Zod schemas for tool validation
 */

import { z } from "zod";

export const searchServersSchema: z.ZodObject<any> = z.object({
  serverQuery: z.string().describe(
    "Search query for finding MCP servers by name",
  ),
  toolQuery: z.string().describe(
    "Search query for finding MCP servers by a single tool name (e.g., 'read_file' not 'read_file write_file')",
  ),
  limit: z.number().optional().default(20).describe(
    "Maximum number of results to return",
  ),
});

export const composeMCPCConfigSchema: z.ZodObject<any> = z.object({
  serverName: z.string().describe("Name for your agentic server"),
  toolName: z.string().describe("Name for the agent tool"),
  description: z.string().describe("Description of what the agent does"),
  serverDeps: z.array(z.string()).describe(
    "Array of MCP server names to compose",
  ),
  toolSelection: z.array(
    z.object({
      serverName: z.string(),
      tools: z.union([
        z.array(z.string()),
        z.literal("__ALL__"),
      ]),
    }),
  ).describe(
    "Tool selection for each server. Use '__ALL__' to include all tools from a server, or specify array of tool names.",
  ),
  mode: z.enum(["agentic", "ai_sampling", "ai_acp"]).optional().default(
    "agentic",
  )
    .describe("Execution mode for the agent"),
  enableSampling: z.boolean().optional().default(false)
    .describe("Enable autonomous sampling mode"),
  // New options from @mcpc/core
  samplingConfig: z.object({
    maxIterations: z.number().optional(),
    summarize: z.boolean().optional(),
  }).optional().describe("Configuration for sampling mode execution"),
  maxSteps: z.number().optional().describe(
    "Maximum agentic steps (default: 50)",
  ),
  maxTokens: z.number().optional().describe(
    "Maximum tokens for sampling (default: 128000)",
  ),
  tracingEnabled: z.boolean().optional().describe(
    "Enable OpenTelemetry tracing",
  ),
});

export const getEnvVarSchemasSchema: z.ZodObject<any> = z.object({
  serverNames: z.array(z.string()).describe(
    "Array of server names to get env vars for",
  ),
});
