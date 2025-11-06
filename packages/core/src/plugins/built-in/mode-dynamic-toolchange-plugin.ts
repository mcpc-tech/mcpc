/**
 * Dynamic Tool Change Mode Plugin
 * Implements the "dynamic_toolchange" execution mode as a built-in plugin
 *
 * This mode allows:
 * - Runtime enabling/disabling of tools
 * - Client notification when tool list changes
 * - Reduced initial tool overload
 *
 * Inspired by GitHub MCP Server's dynamic toolsets feature.
 */

import type { ToolPlugin } from "../../plugin-types.ts";
import { registerDynamicToolChangeTool } from "../../executors/dynamic-toolchange/dynamic-toolchange-tool-registrar.ts";

export const createDynamicToolChangeModePlugin = (): ToolPlugin => ({
  name: "mode-dynamic-toolchange",
  version: "1.0.0",

  // Only apply to dynamic_toolchange mode
  apply: "dynamic_toolchange",

  // Register the agent tool
  registerAgentTool: (context) => {
    registerDynamicToolChangeTool(context.server, {
      description: context.description,
      name: context.name,
      allToolNames: context.allToolNames,
      depGroups: context.depGroups,
      toolNameToDetailList: context.toolNameToDetailList,
    });
  },
});

// Export default instance for auto-loading
export default createDynamicToolChangeModePlugin();
