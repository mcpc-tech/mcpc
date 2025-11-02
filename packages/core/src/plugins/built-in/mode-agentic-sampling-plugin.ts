/**
 * Agentic Sampling Mode Plugin
 * Implements the "agentic_sampling" execution mode as a built-in plugin
 * This mode enables autonomous execution with sampling capabilities
 */

import type { ToolPlugin } from "../../plugin-types.ts";
import { registerAgenticSamplingTool } from "../../executors/agentic/agentic-sampling-registrar.ts";

export const createAgenticSamplingModePlugin = (): ToolPlugin => ({
  name: "mode-agentic-sampling",
  version: "1.0.0",

  // Only apply to agentic_sampling mode
  apply: "agentic_sampling",

  // Register the agent tool with sampling
  registerAgentTool: (context) => {
    registerAgenticSamplingTool(context.server, {
      description: context.description,
      name: context.name,
      allToolNames: context.allToolNames,
      depGroups: context.depGroups,
      toolNameToDetailList: context.toolNameToDetailList,
      samplingConfig: context.options.samplingConfig,
    });
  },
});

// Export default instance for auto-loading
export default createAgenticSamplingModePlugin();
