/**
 * Built-in plugins for MCPC tool processing
 * These plugins handle core functionality like configuration, visibility, and tool name mapping
 */

export { createConfigPlugin } from "./config-plugin.ts";
export { createToolNameMappingPlugin } from "./tool-name-mapping-plugin.ts";
export { createLoggingPlugin } from "./logging-plugin.ts";
export { createAgenticModePlugin } from "./mode-agentic-plugin.ts";
export { createWorkflowModePlugin } from "./mode-workflow-plugin.ts";
export { createWorkflowSamplingModePlugin } from "./mode-workflow-sampling-plugin.ts";
export { createAISamplingModePlugin } from "./mode-ai-sampling-plugin.ts";
export { createAIACPModePlugin } from "./mode-ai-acp-plugin.ts";

// Import default instances
import configPlugin from "./config-plugin.ts";
import toolNameMappingPlugin from "./tool-name-mapping-plugin.ts";
import loggingPlugin from "./logging-plugin.ts";
import agenticModePlugin from "./mode-agentic-plugin.ts";
import workflowModePlugin from "./mode-workflow-plugin.ts";
import workflowSamplingModePlugin from "./mode-workflow-sampling-plugin.ts";
import aiSamplingModePlugin from "./mode-ai-sampling-plugin.ts";
import aiAcpModePlugin from "./mode-ai-acp-plugin.ts";

/**
 * Get all built-in plugins in the correct order
 */
export function getBuiltInPlugins() {
  return [
    toolNameMappingPlugin,
    configPlugin,
    agenticModePlugin,
    workflowModePlugin,
    workflowSamplingModePlugin,
    aiSamplingModePlugin,
    aiAcpModePlugin,
    loggingPlugin,
  ];
}
