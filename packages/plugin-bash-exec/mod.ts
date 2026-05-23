/**
 * @mcpc/plugin-bash-exec
 *
 * Real bash / CLI execution plugin using secure-exec policy mediation.
 *
 * @example
 * ```typescript
 * import { createBashExecPlugin } from "@mcpc/plugin-bash-exec";
 * { plugins: [createBashExecPlugin({ allowCommands: ["whoami", "pwd"] })] }
 * ```
 */

export {
  type BashExecPluginOptions,
  type CliEnvMode,
  type CliPolicyOptions,
  createBashExecPlugin,
  createPlugin,
} from "./src/plugin.ts";

export { default as bashExecPlugin } from "./src/plugin.ts";
export { default } from "./src/plugin.ts";
