/**
 * @mcpc/plugin-markdown-loader
 *
 * Markdown agent definition loader plugin for MCPC.
 * Enables loading agent definitions from Markdown files with YAML front matter.
 *
 * @example
 * ```typescript
 * // Option 1: String path (recommended)
 * const server = await mcpc(
 *   [{ name: "server", version: "1.0.0" }, { capabilities: { tools: {} } }],
 *   ["./agents/my-agent.md"],
 *   { plugins: ["@mcpc/plugin-markdown-loader"] }
 * );
 *
 * // Option 2: Import directly
 * import { markdownLoaderPlugin } from "@mcpc/plugin-markdown-loader";
 * const server = await mcpc(
 *   [{ name: "server", version: "1.0.0" }, { capabilities: { tools: {} } }],
 *   ["./agents/my-agent.md"],
 *   { plugins: [markdownLoaderPlugin()] }
 * );
 * ```
 *
 * @module
 */

import type { ToolPlugin } from "@mcpc/core";
import { loadMarkdownAgentFile } from "./src/markdown-loader.ts";

export {
  isDirectory,
  isMarkdownAgentFile,
  type LoadDirectoryResult,
  loadMarkdownAgentDirectory,
  loadMarkdownAgentFile,
  type MarkdownAgentFrontMatter,
  markdownAgentToComposeDefinition,
  type ParsedMarkdownAgent,
  parseMarkdownAgent,
} from "./src/markdown-loader.ts";

/**
 * Create a Markdown loader plugin for mcpc().
 *
 * This plugin registers the Markdown file loader, enabling you to use
 * Markdown file paths as compose inputs.
 */
export function markdownLoaderPlugin(): ToolPlugin {
  return {
    name: "markdown-loader",
    version: "1.0.0",
    enforce: "pre", // Run before other plugins
    configureServer: (server) => {
      server.registerFileLoader(".md", loadMarkdownAgentFile);
      server.registerFileLoader(".markdown", loadMarkdownAgentFile);
    },
  };
}

/** Factory function for string-based plugin loading */
export const createPlugin = markdownLoaderPlugin;

/** Default plugin instance for string-based plugin loading */
const defaultPlugin: ToolPlugin = markdownLoaderPlugin();
export default defaultPlugin;
