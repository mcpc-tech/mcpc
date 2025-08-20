import type { ComposeEndContext, ToolPlugin } from "../../plugin-types.ts";

/**
 * Built-in plugin that provides composition logging
 * Shows information about composed tools after composition is complete
 */
export const createLoggingPlugin = (
  options: {
    enabled?: boolean;
    verbose?: boolean;
    compact?: boolean;
  } = {}
): ToolPlugin => {
  const { enabled = true, verbose = false, compact = true } = options;

  return {
    name: "built-in-logging",
    composeEnd: (context: ComposeEndContext) => {
      if (!enabled) return;

      if (compact) {
        // Single line compact format with emojis for better readability
        const pluginCount = context.pluginNames.length;
        const externalCount = context.externalToolNames.length;
        const internalCount = context.internalToolNames.length;

        console.log(
          `🧩 [${context.serverName}] ${pluginCount} plugins • ${externalCount} external tools • ${internalCount} internal tools`
        );
      } else if (verbose) {
        console.log(`🧩 [${context.serverName}]`);
        console.log(`   ├─ Plugins: ${context.pluginNames.join(", ")}`);
        
        // Get all tool information from server
        const server = context.server;
        const allToolNames = server.getAllToolNames?.() || [];
        const publicTools = server.tools || [];
        const globalToolNames = publicTools.map((t: any) => t.name);
        
        console.log(`   ├─ External: ${context.externalToolNames.join(", ") || "none"}`);
        console.log(`   ├─ Internal: ${context.internalToolNames.join(", ") || "none"}`);
        console.log(`   ├─ Global: ${globalToolNames.join(", ") || "none"}`);
        console.log(`   └─ Total: ${allToolNames.length} tools (${allToolNames.join(", ")})`);
      }
    },
  };
};

// Export factory function for parameterized usage
export const createPlugin = createLoggingPlugin;

// Default export for static usage - use verbose format with nice indentation
export default createLoggingPlugin({ verbose: true, compact: false });
