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
 *
 * This is a wrapper that uses the @mcpc/plugin-code-execution package.
 */

import { codeExecutionPlugin } from "@mcpc/plugin-code-execution";

// Export the plugin from the standalone package
export default codeExecutionPlugin;
