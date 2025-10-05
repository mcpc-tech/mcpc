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
 * This function takes a MCPC server instance and returns an object mapping
 * tool names to AI SDK tool definitions. The returned tools can be directly
 * used with AI SDK's `generateText` or `streamText` functions.
 *
 * @param server - The MCPC server instance
 * @param tool - The AI SDK tool() helper function from "ai" package
 * @param jsonSchema - The AI SDK jsonSchema() helper function from "ai" package
 * @returns Object mapping tool names to AI SDK compatible tools
 *
 * @example
 * ```typescript
 * import { tool, jsonSchema } from "ai";
 * import { mcpc } from "@mcpc/core";
 * import { convertToAISDKTools } from "@mcpc/core/ai-sdk-adapter";
 *
 * const server = await mcpc([...], [...]);
 * const tools = convertToAISDKTools(server, tool, jsonSchema);
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
  tool: ToolHelper,
  jsonSchema: JsonSchemaHelper,
): Record<string, unknown> {
  const mcpcTools = server.getPublicTools();

  return Object.fromEntries(
    mcpcTools.map((mcpcTool: Tool) => [
      mcpcTool.name,
      tool({
        description: mcpcTool.description || "No description",
        parameters: jsonSchema(mcpcTool.inputSchema) as unknown as Record<
          string,
          unknown
        >,
        execute: async (input: any) => {
          return await server.callTool(mcpcTool.name, input);
        },
      }),
    ]),
  );
}

/**
 * Type definition for AI SDK's tool() helper function.
 * This matches the signature from the "ai" package.
 */
export interface ToolHelper {
  (options: {
    description: string;
    parameters: any;
    execute: (input: any) => Promise<any>;
  }): unknown;
}

/**
 * Type definition for AI SDK's jsonSchema() helper function.
 * This matches the signature from the "ai" package.
 */
export interface JsonSchemaHelper {
  (schema: any): unknown;
}
