import { ToolPlugin, TransformContext } from "../../plugin-types.ts";

/**
 * Built-in plugin that applies tool configuration overrides
 * Handles description overrides from toolConfigs
 */
export const createConfigPlugin = (): ToolPlugin => ({
  name: "built-in-config",
  enforce: "pre",
  transformTool: (tool, context: TransformContext) => {
    const server = context.server as any; // Access to findToolConfig method
    const config = server.findToolConfig?.(context.toolName);

    if (config?.description) {
      tool.description = config.description;
    }

    return tool;
  },
});

// Export factory function for parameterized usage
export const createPlugin = createConfigPlugin;

// Default export for static usage
export default createConfigPlugin();
