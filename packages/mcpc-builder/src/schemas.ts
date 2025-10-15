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
  mode: z.enum(["agentic", "agentic_workflow"]).optional().default("agentic")
    .describe("Execution mode for the agent"),
  enableSampling: z.boolean().optional().default(false)
    .describe("Enable autonomous sampling mode"),
  userConfigs: z.record(z.record(z.string())).optional()
    .describe("Environment variables for each server"),
});

export const getEnvVarSchemasSchema: z.ZodObject<any> = z.object({
  serverNames: z.array(z.string()).describe(
    "Array of server names to get env vars for",
  ),
});
