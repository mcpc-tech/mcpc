import type { ToolPlugin } from "../../compose.ts";

/**
 * Built-in plugin that applies tool configuration overrides
 * Handles description overrides from toolConfigs
 */
export const createConfigPlugin = (): ToolPlugin => ({
  name: "built-in-config",
  when: "compose",
  enforce: "pre",
  transform: (tool, context) => {
    const server = context.server as any; // Access to findToolConfig method
    const config = server.findToolConfig?.(context.toolName);

    if (config?.description) {
      tool.description = config.description;
    }

    return tool;
  },
});
