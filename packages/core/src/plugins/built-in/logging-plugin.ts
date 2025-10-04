import type { ComposeEndContext, ToolPlugin } from "../../plugin-types.ts";
import { createLogger } from "../../utils/logger.ts";

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
    version: "1.0.0",
    composeEnd: async (context: ComposeEndContext) => {
      if (!enabled) return;

      const logger = createLogger("mcpc.plugin.logging", context.server);

      if (compact) {
        // Single line compact format with emojis for better readability
        const pluginCount = context.pluginNames.length;
        const { stats } = context;

        await logger.info(
          `[${context.toolName}] ${pluginCount} plugins • ${stats.publicTools} public • ${stats.hiddenTools} hidden`,
        );
      } else if (verbose) {
        await logger.info(`[${context.toolName}] Composition complete`);
        await logger.info(`   ├─ Plugins: ${context.pluginNames.join(", ")}`);

        const { stats } = context;

        // Get detailed tool lists
        const server = context.server;
        const publicTools = Array.from(
          new Set(server.getPublicToolNames().map(String)),
        );
        const hiddenTools = Array.from(
          new Set(server.getHiddenToolNames().map(String)),
        );

        if (publicTools.length > 0) {
          await logger.info(`   ├─ Public: ${publicTools.join(", ")}`);
        }
        if (hiddenTools.length > 0) {
          await logger.info(`   ├─ Hidden: ${hiddenTools.join(", ")}`);
        }
        await logger.info(`   └─ Total: ${stats.totalTools} tools`);
      }
    },
  };
};

// Export factory function for parameterized usage
export const createPlugin = createLoggingPlugin;

// Default export for static usage - use verbose format with nice indentation
export default createLoggingPlugin({ verbose: true, compact: false });
