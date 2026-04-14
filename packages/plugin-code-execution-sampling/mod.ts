/**
 * @mcpc/plugin-code-execution-sampling
 *
 * Code execution mode plugin for MCPC that combines secure sandbox execution
 * with MCP sampling-backed model calls.
 *
 * @example
 * ```typescript
 * import { createCodeExecutionSamplingPlugin } from "@mcpc/plugin-code-execution-sampling";
 *
 * {
 *   plugins: [createCodeExecutionSamplingPlugin()],
 *   options: { mode: "code_execution_sampling" }
 * }
 * ```
 */

export {
  CODE_EXECUTION_SAMPLING_MODE,
  type CodeExecutionSamplingPluginOptions,
  createCodeExecutionSamplingPlugin,
} from "./src/plugin.ts";
export { default as codeExecutionSamplingPlugin } from "./src/plugin.ts";

export {
  createSandboxSamplingHandler,
  type SandboxSamplingHandler,
  type SandboxSamplingHandlerOptions,
  type SandboxSamplingResult,
} from "./src/sandbox-sampling.ts";

export { createCodeExecutionSamplingPlugin as createPlugin } from "./src/plugin.ts";
export { default } from "./src/plugin.ts";
