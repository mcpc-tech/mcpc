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
  } = {},
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
          `🧩 [${context.serverName}] ${pluginCount} plugins • ${externalCount} external tools • ${internalCount} internal tools`,
        );
      } else if (verbose) {
        console.log(`🧩 [${context.serverName}]`);
        console.log(`   ├─ Plugins: ${context.pluginNames.join(", ")}`);

        // Get all tool information from server
        const server = context.server;
        const publicTools = (server.tools ?? []) as Array<{ name: string }>;
        const globalToolNames = Array.from(
          new Set<string>(publicTools.map((t) => String(t.name))),
        ) as string[];

        // Ensure uniqueness across categories
        const external = Array.from(new Set<string>(context.externalToolNames));
        const internal = Array.from(new Set<string>(context.internalToolNames));
        const totalSet = new Set<string>([
          ...external,
          ...internal,
          ...globalToolNames,
        ]);
        const totalList = Array.from(totalSet);

        console.log(`   ├─ External: ${external.join(", ") || "none"}`);
        console.log(`   ├─ Internal: ${internal.join(", ") || "none"}`);
        console.log(`   ├─ Global: ${globalToolNames.join(", ") || "none"}`);
        console.log(
          `   └─ Total: ${totalList.length} tools (${totalList.join(", ")})`,
        );
      }
    },
  };
};

// Export factory function for parameterized usage
export const createPlugin = createLoggingPlugin;

// Default export for static usage - use verbose format with nice indentation
export default createLoggingPlugin({ verbose: true, compact: false });
