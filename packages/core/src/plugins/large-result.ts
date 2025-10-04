/**
 * Large Result Plugin - Handles tool results that exceed context limits
 * Enhanced with better resource management and error handling
 */

import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSearchPlugin, type SearchOptions } from "./search-tool.ts";
import type { ToolPlugin } from "../plugin-types.ts";

interface PluginOptions {
  maxSize?: number;
  previewSize?: number;
  tempDir?: string;
  search?: SearchOptions;
}

/**
 * Create a plugin that handles large tool results by saving them to files
 * and providing search capabilities for the saved content.
 */
export function createLargeResultPlugin(
  options: PluginOptions = {},
): ToolPlugin {
  const maxSize = options.maxSize || 8000;
  const previewSize = options.previewSize || 4000;
  let tempDir: string | null = options.tempDir || null;

  // Use Map to track configured servers by reference
  const configuredServers = new Map<object, boolean>();

  const searchConfig: SearchOptions = {
    maxResults: options.search?.maxResults || 15,
    maxOutputSize: options.search?.maxOutputSize || 4000,
    global: true,
  };

  return {
    name: "plugin-large-result-handler",
    version: "1.0.0",
    dependencies: [], // Search plugin will be added dynamically

    configureServer: async (server) => {
      // Add search plugin for this specific server (once per server)
      if (!configuredServers.has(server)) {
        const searchPlugin = createSearchPlugin(searchConfig);
        await server.addPlugin(searchPlugin);
        configuredServers.set(server, true);
      }
    },

    transformTool: (tool, context) => {
      const originalExecute = tool.execute;

      tool.execute = async (args: unknown) => {
        try {
          const result = await originalExecute(args);

          const resultText = JSON.stringify(result);
          if (resultText.length <= maxSize) {
            return result;
          }

          // Create temp directory if needed
          if (!tempDir) {
            tempDir = await mkdtemp(join(tmpdir(), "mcpc-results-"));
          }

          // Sanitize tool name for safe filename usage
          const safeToolName = encodeURIComponent(context.toolName ?? "tool");
          const fileName = `${safeToolName}-${Date.now()}.txt`;
          const filePath = join(tempDir, fileName);

          await writeFile(filePath, resultText);

          const preview = resultText.slice(0, previewSize);
          const sizeKB = (resultText.length / 1024).toFixed(1);

          return {
            content: [
              {
                type: "text",
                text:
                  `**Result too large (${resultText.length} chars), saved to file**

📁 **File:** ${filePath}
📊 **Size:** ${sizeKB} KB

**Preview (${previewSize} chars):**
\`\`\`
${preview}
\`\`\`

**To read/understand the full content:**
- Use the \`search-tool-result\` tool with pattern: \`search-tool-result {"pattern": "your-search-term"}\`
- Search supports regex patterns for advanced queries`,
              },
            ],
          };
        } catch (error) {
          // If transformation fails, return original error
          const errorMsg = error instanceof Error
            ? error.message
            : String(error);
          console.error(
            `Large result plugin error for ${context.toolName}: ${errorMsg}`,
          );
          throw error;
        }
      };

      return tool;
    },

    dispose: () => {
      // Cleanup: clear server tracking
      configuredServers.clear();
      // Note: temp files are in system temp dir and will be cleaned by OS
      tempDir = null;
    },
  };
}

/**
 * Default large result plugin instance with common settings
 */
const defaultLargeResultPlugin: ToolPlugin = createLargeResultPlugin({
  maxSize: 8000,
  previewSize: 4000,
});

// Export factory function for parameterized usage
export const createPlugin = createLargeResultPlugin;

export default defaultLargeResultPlugin;
