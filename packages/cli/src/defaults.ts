/**
 * Default configuration for MCPC CLI
 */

import { createLargeResultPlugin } from "@mcpc/core/plugins/large-result";
import { createSkillsPlugin } from "@mcpc/core/plugins/skills";
import {
  codeExecutionPlugin,
  createCodeExecutionPlugin,
} from "@mcpc-tech/plugin-code-execution";
import type { ComposeDefinition, ToolPlugin } from "@mcpc/core";
import { resolve } from "node:path";
import process from "node:process";

/** Default skills directory */
export const DEFAULT_SKILLS_PATHS = [".claude/skills"];

/** Default code execution timeout (5 minutes) */
export const DEFAULT_CODE_EXECUTION_TIMEOUT = 300_000;

/**
 * Get global plugins applied to all agents
 * Resolves relative paths to absolute paths based on cwd
 */
export function getGlobalPlugins(
  skillsPaths: string[],
): (string | ToolPlugin)[] {
  // Resolve relative paths to absolute paths
  const resolvedPaths = skillsPaths.map((p) => resolve(process.cwd(), p));
  return [
    "@mcpc/plugin-markdown-loader",
    createSkillsPlugin({ paths: resolvedPaths }),
  ];
}

/**
 * Get agent-level plugins
 */
export function getAgentPlugins(): ToolPlugin[] {
  return [
    createCodeExecutionPlugin({
      sandbox: { timeout: DEFAULT_CODE_EXECUTION_TIMEOUT },
    }),
  ];
}

/**
 * Default agent configuration when no config file is found
 */
export function getDefaultAgents(): ComposeDefinition[] {
  return [
    {
      name: null,
      description: "",
      plugins: [
        createLargeResultPlugin({}),
        codeExecutionPlugin,
      ],
      options: {
        mode: "code_execution",
      },
    },
  ];
}
