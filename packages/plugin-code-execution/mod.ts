/**
 * @mcpc/plugin-code-execution
 *
 * Code execution mode plugin for MCPC using secure Deno sandbox.
 *
 * @example
 * ```typescript
 * // String-based loading (no params)
 * { plugins: ["@mcpc/plugin-code-execution"] }
 *
 * // Import directly
 * import { createCodeExecutionPlugin } from "@mcpc/plugin-code-execution";
 * { plugins: [createCodeExecutionPlugin({ sandbox: { timeout: 30000 } })] }
 * ```
 */

// Export plugin
export {
  type CodeExecutionPluginOptions,
  createCodeExecutionPlugin,
} from "./src/plugin.ts";
export { default as codeExecutionPlugin } from "./src/plugin.ts";

// Alias for string-based plugin loading
export { createCodeExecutionPlugin as createPlugin } from "./src/plugin.ts";

// Default export for string-based plugin loading
export { default } from "./src/plugin.ts";

// Export sandbox utilities
export {
  type SandboxConfig,
  SandboxExecutor,
  type SandboxHandler,
  type ToolCallHandler,
} from "./src/sandbox-executor.ts";
