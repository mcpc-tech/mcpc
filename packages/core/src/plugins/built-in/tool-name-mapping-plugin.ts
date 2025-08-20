import { ToolPlugin, TransformContext } from "../../plugin-types.ts";

/**
 * Built-in plugin that handles tool name mapping between dot and underscore notation
 * Allows tools to be referenced with both formats (e.g., "server.tool" and "server_tool")
 */
export const createToolNameMappingPlugin = (): ToolPlugin => ({
  name: "built-in-tool-name-mapping",
  enforce: "pre", // Apply early to establish mappings
  transformTool: (tool, context: TransformContext) => {
    const server = context.server as any;
    const toolName = context.toolName;

    // Create bidirectional mapping between dot and underscore notation
    const dotNotation = toolName.replace(/_/g, ".");
    const underscoreNotation = toolName.replace(/\./g, "_");

    if (dotNotation !== toolName && server.toolNameMapping) {
      server.toolNameMapping.set(dotNotation, toolName);
      server.toolNameMapping.set(toolName, dotNotation);
    }

    if (underscoreNotation !== toolName && server.toolNameMapping) {
      server.toolNameMapping.set(underscoreNotation, toolName);
      server.toolNameMapping.set(toolName, underscoreNotation);
    }

    return tool;
  },
});

// Export factory function for parameterized usage
export const createPlugin = createToolNameMappingPlugin;

// Default export for static usage
export default createToolNameMappingPlugin();
