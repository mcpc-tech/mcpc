/**
 * Dynamic Prompting Mode Plugin
 * Implements the "dynamic_prompting" execution mode as a built-in plugin
 *
 * This mode provides a two-stage interaction:
 * 1. Select action/tool
 * 2. Provide parameters for that tool
 *
 * Similar to workflow mode but focused on interactive parameter gathering.
 */

import type { ToolPlugin } from "../../plugin-types.ts";
import { registerDynamicPromptingTool } from "../../executors/dynamic-prompting/dynamic-prompting-tool-registrar.ts";

export const createDynamicPromptingModePlugin = (): ToolPlugin => ({
  name: "mode-dynamic-prompting",
  version: "1.0.0",

  // Only apply to dynamic_prompting mode
  apply: "dynamic_prompting",

  // Register the agent tool
  registerAgentTool: (context) => {
    registerDynamicPromptingTool(context.server, {
      description: context.description,
      name: context.name,
      allToolNames: context.allToolNames,
      depGroups: context.depGroups,
      toolNameToDetailList: context.toolNameToDetailList,
    });
  },
});

// Export default instance for auto-loading
export default createDynamicPromptingModePlugin();
