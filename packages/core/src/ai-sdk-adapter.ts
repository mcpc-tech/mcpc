/**
 * AI SDK Adapter for MCPC
 *
 * Provides utilities to convert MCPC server tools to AI SDK compatible format
 * for direct integration without transport layer overhead.
 *
 * @module ai-sdk-adapter
 */

import type { ComposableMCPServer } from "./compose.ts";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Converts MCPC server tools to AI SDK compatible tools format.
 *
 * This function takes a MCPC server instance and AI SDK helpers, returning
 * an object mapping tool names to AI SDK tool definitions.
 *
 * @param server - The MCPC server instance
 * @param helpers - Object containing AI SDK helper functions
 * @param helpers.tool - The AI SDK tool() helper function from "ai" package
 * @param helpers.jsonSchema - The AI SDK jsonSchema() helper function from "ai" package
 * @returns Object mapping tool names to AI SDK compatible tools
 *
 * @example
 * ```typescript
 * import { tool, jsonSchema, generateText } from "ai";
 * import { mcpc } from "@mcpc/core";
 * import { convertToAISDKTools } from "@mcpc/core/ai-sdk-adapter";
 *
 * const server = await mcpc([...], [...]);
 * const tools = convertToAISDKTools(server, { tool, jsonSchema });
 *
 * const result = await generateText({
 *   model: openai("gpt-4"),
 *   tools,
 *   prompt: "Your prompt here"
 * });
 * ```
 */
export function convertToAISDKTools(
  server: ComposableMCPServer,
  helpers: {
    tool: ToolHelper;
    jsonSchema: JsonSchemaHelper;
  },
): Record<string, any> {
  const { tool, jsonSchema } = helpers;
  const mcpcTools = server.getPublicTools();

  return Object.fromEntries(
    mcpcTools.map((mcpcTool: Tool) => [
      mcpcTool.name,
      tool({
        description: mcpcTool.description || "No description",
        inputSchema: jsonSchema(mcpcTool.inputSchema),
        execute: async (input: any) => {
          return await server.callTool(mcpcTool.name, input);
        },
      } as any),
    ]),
  );
}

/**
 * Type definition for AI SDK's tool() helper function.
 * Using a generic function type to accept any compatible tool helper.
 */
export type ToolHelper = (...args: any[]) => any;

/**
 * Type definition for AI SDK's jsonSchema() helper function.
 */
export type JsonSchemaHelper = (...args: any[]) => any;
