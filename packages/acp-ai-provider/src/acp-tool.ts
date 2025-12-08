import { jsonSchema, type Tool, tool } from "ai";

/**
 * The name of the provider tool used to represent ACP agent tool calls.
 */
export const ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME =
  "acp.acp_provider_agent_dynamic_tool";

/**
 * Global registry to store execute functions by tool name
 */
const executeRegistry = new Map<string, (args: unknown) => Promise<unknown>>();

/**
 * Wrap AI SDK tools with ACP execute preservation.
 * Automatically includes the ACP provider dynamic tool for streaming tool calls.
 *
 * @example
 * ```typescript
 * import { acpTools } from "@mcpc/acp-ai-provider";
 * import { tool } from "ai";
 * import { z } from "zod";
 *
 * streamText({
 *   model: provider.languageModel(),
 *   tools: acpTools({
 *     greet: tool({
 *       description: "Greet someone",
 *       inputSchema: z.object({ name: z.string() }),
 *       execute: async ({ name }) => `Hello, ${name}!`,
 *     }),
 *   }),
 * });
 * ```
 */
export function acpTools<T extends Record<string, Tool<any, any>>>(
  tools: T,
): T & Record<string, ReturnType<typeof tool>> {
  // Register all execute functions
  for (const [name, toolDef] of Object.entries(tools)) {
    if (toolDef.execute) {
      executeRegistry.set(
        name,
        toolDef.execute as unknown as (args: unknown) => Promise<unknown>,
      );
    }
  }

  // Return tools merged with the ACP provider dynamic tool
  return {
    ...tools,
    [ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME]: tool({
      type: "provider-defined",
      id: ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME as `${string}.${string}`,
      name: ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME,
      args: {},
      inputSchema: jsonSchema({}),
    }),
  } as unknown as T & Record<string, ReturnType<typeof tool>>;
}

/**
 * Get registered execute function by tool name
 */
export function getExecuteByName(
  name: string,
): ((args: unknown) => Promise<unknown>) | undefined {
  return executeRegistry.get(name);
}

/**
 * Check if a tool name has a registered execute function
 */
export function hasRegisteredExecute(name: string): boolean {
  return executeRegistry.has(name);
}

/**
 * Get all registered tool names
 */
export function getRegisteredToolNames(): string[] {
  return Array.from(executeRegistry.keys());
}
