/**
 * Built-in plugins for MCPC tool processing
 * These plugins handle core functionality like configuration, visibility, and tool name mapping
 */

export { createConfigPlugin } from "./config-plugin.ts";
export { createToolNameMappingPlugin } from "./tool-name-mapping-plugin.ts";
export { createLoggingPlugin } from "./logging-plugin.ts";
export { createAgenticModePlugin } from "./mode-agentic-plugin.ts";
export { createWorkflowModePlugin } from "./mode-workflow-plugin.ts";
export { createAgenticSamplingModePlugin } from "./mode-agentic-sampling-plugin.ts";
export { createWorkflowSamplingModePlugin } from "./mode-workflow-sampling-plugin.ts";
export { createCodeExecutionModePlugin } from "./mode-code-execution-plugin.ts";

// Import default instances
import configPlugin from "./config-plugin.ts";
import toolNameMappingPlugin from "./tool-name-mapping-plugin.ts";
import loggingPlugin from "./logging-plugin.ts";
import agenticModePlugin from "./mode-agentic-plugin.ts";
import workflowModePlugin from "./mode-workflow-plugin.ts";
import agenticSamplingModePlugin from "./mode-agentic-sampling-plugin.ts";
import workflowSamplingModePlugin from "./mode-workflow-sampling-plugin.ts";
import codeExecutionModePlugin from "./mode-code-execution-plugin.ts";

/**
 * Get all built-in plugins in the correct order
 */
export function getBuiltInPlugins() {
  return [
    toolNameMappingPlugin, // First: establish name mappings
    configPlugin, // Second: apply configurations
    agenticModePlugin, // Third: agentic mode handler
    workflowModePlugin, // Fourth: workflow mode handler
    agenticSamplingModePlugin, // Fifth: agentic sampling mode handler
    workflowSamplingModePlugin, // Sixth: workflow sampling mode handler
    codeExecutionModePlugin, // Seventh: code execution mode handler
    loggingPlugin, // Last: logging
  ];
}
