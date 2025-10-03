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
    composeEnd: async (context: ComposeEndContext) => {
      if (!enabled) return;

      const logger = createLogger("mcpc.plugin.logging", context.server);

      if (compact) {
        // Single line compact format with emojis for better readability
        const pluginCount = context.pluginNames.length;
        const server = context.server;
        const externalList = server.getExternalToolNames();
        const internalList = server.getInternalToolNames();
        const hiddenList = server.getHiddenToolNames();
        const publicToolNames = server.getPublicToolNames();

        const externalCount = externalList.length;
        const internalCount = internalList.length;
        const hiddenCount = hiddenList.length;
        const globalCount = publicToolNames.length;

        await logger.info(
          `[${context.toolName}] ${pluginCount} plugins • ${externalCount} external • ${internalCount} internal • ${hiddenCount} hidden • ${globalCount} global`,
        );
      } else if (verbose) {
        await logger.info(`[${context.toolName}] Composition complete`);
        await logger.info(`   ├─ Plugins: ${context.pluginNames.join(", ")}`);

        // Get all tool information from server
        const server = context.server;
        const globalToolNames = Array.from(
          new Set(server.getPublicToolNames().map(String)),
        );

        // Ensure uniqueness across categories and coerce to string[]
        const external: string[] = Array.from(
          new Set(server.getExternalToolNames().map(String)),
        );
        const internal: string[] = Array.from(
          new Set(server.getInternalToolNames().map(String)),
        );
        const hidden: string[] = Array.from(
          new Set(server.getHiddenToolNames().map(String)),
        );
        const globalNames: string[] = globalToolNames.map(String);
        const totalSet = new Set<string>([
          ...external,
          ...internal,
          ...globalNames,
        ]);
        const totalList = Array.from(totalSet);

        if (external.length > 0) {
          await logger.info(`   ├─ External: ${external.join(", ")}`);
        }
        if (internal.length > 0) {
          await logger.info(`   ├─ Internal: ${internal.join(", ")}`);
        }
        if (globalNames.length > 0) {
          await logger.info(`   ├─ Global: ${globalNames.join(", ")}`);
        }
        if (hidden.length > 0) {
          await logger.info(`   ├─ Hidden: ${hidden.join(", ")}`);
        }
        if (totalList.length > 0) {
          await logger.info(`   └─ Total: ${totalList.length} tools`);
        }
      }
    },
  };
};

// Export factory function for parameterized usage
export const createPlugin = createLoggingPlugin;

// Default export for static usage - use verbose format with nice indentation
export default createLoggingPlugin({ verbose: true, compact: false });
