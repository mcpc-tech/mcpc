/**
 * Workflow Sampling Mode Plugin
 * Implements the "agentic_workflow_sampling" execution mode as a built-in plugin
 * This mode enables autonomous workflow execution with sampling capabilities
 */

import type { ToolPlugin } from "../../plugin-types.ts";
import { registerWorkflowSamplingTool } from "../../executors/workflow/workflow-sampling-registrar.ts";

export const createWorkflowSamplingModePlugin = (): ToolPlugin => ({
  name: "mode-agentic-workflow-sampling",
  version: "1.0.0",

  // Only apply to agentic_workflow_sampling mode
  apply: "agentic_workflow_sampling",

  // Register the agent tool with sampling
  registerAgentTool: (context) => {
    registerWorkflowSamplingTool(context.server, {
      description: context.description,
      name: context.name,
      allToolNames: context.allToolNames,
      depGroups: context.depGroups,
      toolNameToDetailList: context.toolNameToDetailList,
      predefinedSteps: context.options.steps,
      samplingConfig: context.options.samplingConfig,
      ensureStepActions: context.options.ensureStepActions,
      toolNameToIdMapping: context.toolNameToIdMapping,
    });
  },
});

// Export default instance for auto-loading
export default createWorkflowSamplingModePlugin();
