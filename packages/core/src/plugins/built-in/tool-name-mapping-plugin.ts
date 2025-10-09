import type { ToolPlugin, TransformContext } from "../../plugin-types.ts";

/**
 * Built-in plugin that handles tool name mapping between dot and underscore notation
 * Allows tools to be referenced with both formats (e.g., "server.tool" and "server_tool")
 * Also sanitizes tool names to comply with API restrictions
 */
export const createToolNameMappingPlugin = (): ToolPlugin => ({
  name: "built-in-tool-name-mapping",
  version: "1.0.0",
  enforce: "pre", // Apply early to establish mappings
  transformTool: (tool, context: TransformContext) => {
    const server = context.server;
    const toolName = context.toolName; // Sanitized name (e.g., "_c_desktop-commander_start_process")

    // Get original name if available (e.g., "@c/desktop-commander.start_process")
    const originalName = (tool as any)._originalName || toolName;

    // Create bidirectional mapping between dot and underscore notation
    // Based on ORIGINAL name to support both @scope/server.tool and @scope/server_tool
    const dotNotation = originalName.replace(/_/g, ".");
    const underscoreNotation = originalName.replace(/\./g, "_");

    if (dotNotation !== originalName && server.toolNameMapping) {
      server.toolNameMapping.set(dotNotation, toolName);
    }

    if (underscoreNotation !== originalName && server.toolNameMapping) {
      server.toolNameMapping.set(underscoreNotation, toolName);
    }

    // Also map the original name to sanitized name
    if (originalName !== toolName && server.toolNameMapping) {
      server.toolNameMapping.set(originalName, toolName);
    }

    return tool;
  },
});

// Export factory function for parameterized usage
export const createPlugin = createToolNameMappingPlugin;

// Default export for static usage
export default createToolNameMappingPlugin();
