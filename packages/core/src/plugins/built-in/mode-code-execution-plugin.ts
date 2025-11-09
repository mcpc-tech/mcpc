/**
 * Code Execution Mode Plugin
 * Implements efficient MCP interaction using code execution pattern
 *
 * Based on: https://www.anthropic.com/engineering/code-execution-with-mcp
 *
 * Key benefits:
 * - Progressive disclosure: Load tool definitions on-demand
 * - Context efficiency: Process data in execution environment
 * - Reduced token usage: Only results that matter pass through model
 */

import type { ToolPlugin } from "../../plugin-types.ts";
import { registerCodeExecutionTool } from "../../executors/code-execution/code-execution-tool-registrar.ts";

export const createCodeExecutionModePlugin = (): ToolPlugin => ({
  name: "mode-code-execution",
  version: "1.0.0",

  // Only apply to code execution mode
  apply: "code_execution",

  // Register the agent tool
  registerAgentTool: (context) => {
    registerCodeExecutionTool(context.server, {
      description: context.description,
      name: context.name,
      allToolNames: context.allToolNames,
      depGroups: context.depGroups,
      toolNameToDetailList: context.toolNameToDetailList,
      publicToolNames: context.publicToolNames,
      hiddenToolNames: context.hiddenToolNames,
    });
  },
});

// Export default instance for auto-loading
export default createCodeExecutionModePlugin();
