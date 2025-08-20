import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  ComposedTool,
  ToolPlugin,
  TransformContext,
} from "../../plugin-types.ts";

/**
 * Built-in plugin that handles tool visibility configurations
 * Manages hide, global, and internal tool visibility settings
 */
export const createVisibilityPlugin = (): ToolPlugin => ({
  name: "built-in-visibility",
  enforce: "post", // Apply after other transformations
  transformTool: (tool, context: TransformContext) => {
    const server = context.server as any;
    const config = server.findToolConfig?.(context.toolName);

    if (!config?.visibility) {
      return tool;
    }

    // Store visibility metadata on the tool for later processing
    (tool as any)._visibility = config.visibility;

    return tool;
  },
});

/**
 * Helper function to process visibility after all plugins are applied
 * This should be called from the main server logic
 */
export function processToolVisibility(
  toolId: string,
  tool: ComposedTool,
  server: any,
  externalTools: Record<string, ComposedTool>
): void {
  const visibility = (tool as any)._visibility;

  if (!visibility) return;

  if (visibility.hide) {
    delete externalTools[toolId];
  } else if (visibility.global) {
    // Register as a global tool in the server's public tool list
    const globalTool: Tool = {
      name: toolId,
      description: tool.description,
      inputSchema: tool.inputSchema as Tool["inputSchema"],
    };
    server.tools = [...server.tools, globalTool];
    delete externalTools[toolId];
  }
  // For normal visibility, keep in externalTools
}

// Export factory function for parameterized usage
export const createPlugin = createVisibilityPlugin;

// Default export for static usage
export default createVisibilityPlugin();
