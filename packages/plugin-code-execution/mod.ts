/**
 * @mcpc/plugin-code-execution
 *
 * Code execution mode plugin for MCPC using secure Deno sandbox.
 */

// Export plugin
export {
  type CodeExecutionPluginOptions,
  createCodeExecutionPlugin,
} from "./src/plugin.ts";
export { default as codeExecutionPlugin } from "./src/plugin.ts";

// Export sandbox utilities
export {
  type SandboxConfig,
  SandboxExecutor,
  type ToolCallHandler,
} from "./src/sandbox-executor.ts";
export { JsonRpcHandler } from "./src/json-rpc.ts";
export * from "./src/types.ts";
