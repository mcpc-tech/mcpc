import type { Tool } from "ai";

/**
 * Global registry to store execute functions by tool name
 */
const executeRegistry = new Map<string, (args: unknown) => Promise<unknown>>();

/**
 * Wrap AI SDK tools with ACP execute preservation.
 * Registers tool execute functions for use by the ACP provider.
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
): T {
  // Register all execute functions
  for (const [name, toolDef] of Object.entries(tools)) {
    if (toolDef.execute) {
      executeRegistry.set(
        name,
        toolDef.execute as unknown as (args: unknown) => Promise<unknown>,
      );
    }
  }

  // Return tools as-is (no longer merging dynamic tool)
  return tools;
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

/**
 * Resolves an ACP tool name (which may be in MCP proxy format like `mcp__server__greet`)
 * to the original registered tool name by matching against registered tools.
 * Returns the original name if no match is found.
 */
export function resolveToolName(acpToolName: string): string {
  const registeredNames = getRegisteredToolNames();

  // First, check for exact match
  if (registeredNames.includes(acpToolName)) {
    return acpToolName;
  }

  // Check if the ACP tool name ends with any registered name (after separator)
  // This handles formats like `mcp__server__toolname` -> `toolname`
  for (const registeredName of registeredNames) {
    if (acpToolName.endsWith(`__${registeredName}`)) {
      return registeredName;
    }
  }

  // No match found, return original name
  return acpToolName;
}
