/**
 * @mcpc/plugin-markdown-loader
 *
 * Markdown agent definition loader plugin for MCPC.
 * Enables loading agent definitions from Markdown files with YAML front matter.
 *
 * @example
 * ```typescript
 * import { mcpc } from "@mcpc/core";
 * import { markdownLoaderPlugin } from "@mcpc/plugin-markdown-loader";
 *
 * const server = await mcpc(
 *   [{ name: "server", version: "1.0.0" }, { capabilities: { tools: {} } }],
 *   ["./agents/my-agent.md"],
 *   { plugins: [markdownLoaderPlugin()] }
 * );
 * ```
 *
 * @module
 */

import { setMarkdownAgentLoader, type ToolPlugin } from "@mcpc/core";
import { loadMarkdownAgentFile } from "./src/markdown-loader.ts";

// Re-export for direct use (e.g., CLI auto-registration)
export { setMarkdownAgentLoader } from "@mcpc/core";

export {
  isMarkdownAgentFile,
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
 *
 * @example
 * ```typescript
 * import { mcpc } from "@mcpc/core";
 * import { markdownLoaderPlugin } from "@mcpc/plugin-markdown-loader";
 *
 * const server = await mcpc(
 *   [{ name: "server", version: "1.0.0" }, { capabilities: { tools: {} } }],
 *   ["./agents/my-agent.md"],
 *   { plugins: [markdownLoaderPlugin()] }
 * );
 * ```
 */
export function markdownLoaderPlugin(): ToolPlugin {
  return {
    name: "markdown-loader",
    version: "1.0.0",
    enforce: "pre", // Run before other plugins
    configureServer: () => {
      setMarkdownAgentLoader(loadMarkdownAgentFile);
    },
  };
}
