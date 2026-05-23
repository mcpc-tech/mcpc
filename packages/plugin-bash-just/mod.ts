/**
 * @mcpc/plugin-bash-just
 *
 * Sandboxed bash execution plugin using just-bash (in-memory interpreter).
 * No host filesystem or process.env access unless explicitly configured.
 *
 * @example
 * ```typescript
 * // Default: fully in-memory, zero host access
 * { plugins: [createBashJustPlugin()] }
 *
 * // Enable direct CLI execution with policy controls
 * { plugins: [createBashJustPlugin({ cli: { enabled: true, allowCommands: ["whoami"] } })] }
 * ```
 */

export {
  type BashJustCliOptions,
  type BashJustPluginOptions,
  type CliEnvMode,
  type CliExecutionRequest,
  type CliExecutionResult,
  type CliExecutor,
  type CliPolicyOptions,
  createBashJustPlugin,
  type FsMode,
  type SandboxFn,
  type SandboxResult,
} from "./src/plugin.ts";

export { default as bashJustPlugin } from "./src/plugin.ts";
export { createBashJustPlugin as createPlugin } from "./src/plugin.ts";
export { default } from "./src/plugin.ts";
