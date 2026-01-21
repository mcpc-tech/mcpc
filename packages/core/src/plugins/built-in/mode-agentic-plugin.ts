/**
 * Agentic Mode Plugin
 * Implements the "agentic" execution mode as a built-in plugin
 *
 * Uses simplified Unix-style interface:
 * - `tool`: which tool to execute (or "man" to get schemas)
 * - `args`: parameters for the tool
 */

import type { ToolPlugin } from "../../plugin-types.ts";
import { registerAgenticTool } from "../../executors/agentic/agentic-tool-registrar.ts";

export const createAgenticModePlugin = (): ToolPlugin => ({
  name: "mode-agentic",
  version: "2.0.0",

  // Only apply to agentic mode
  apply: "agentic",

  // Register the agent tool
  registerAgentTool: (context) => {
    registerAgenticTool(context.server, {
      description: context.description,
      name: context.name,
      allToolNames: context.allToolNames,
      depGroups: context.depGroups,
      toolNameToDetailList: context.toolNameToDetailList,
      manual: context.manual,
    });
  },
});

// Export default instance for auto-loading
export default createAgenticModePlugin();
