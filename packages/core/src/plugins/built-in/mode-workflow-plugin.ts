/**
 * Workflow Mode Plugin
 * Implements the "agentic_workflow" execution mode as a built-in plugin
 */

import type { ToolPlugin } from "../../plugin-types.ts";
import { registerAgenticWorkflowTool } from "../../executors/workflow/workflow-tool-registrar.ts";

export const createWorkflowModePlugin = (): ToolPlugin => ({
  name: "mode-workflow",
  version: "1.0.0",

  // Only apply to workflow mode
  apply: "agentic_workflow",

  // Register the agent tool
  registerAgentTool: (context) => {
    registerAgenticWorkflowTool(context.server, {
      description: context.description,
      name: context.name,
      allToolNames: context.allToolNames,
      depGroups: context.depGroups,
      toolNameToDetailList: context.toolNameToDetailList,
      predefinedSteps: context.options.steps,
      ensureStepActions: context.options.ensureStepActions,
      toolNameToIdMapping: context.toolNameToIdMapping,
    });
  },
});

// Export default instance for auto-loading
export default createWorkflowModePlugin();
