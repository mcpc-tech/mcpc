/**
 * Large Result Plugin - Simple plugin to handle tool results that exceed context limits
 */

import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSearchPlugin, type SearchOptions } from "./search-tool.ts";
import { ToolPlugin } from "../plugin-types.ts";

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
  options: PluginOptions = {}
): ToolPlugin {
  const maxSize = options.maxSize || 8000;
  const previewSize = options.previewSize || 4000;
  let tempDir: string | null = options.tempDir || null;
  let searchPluginAdded = false;

  const searchConfig: SearchOptions = {
    maxResults: options.search?.maxResults || 15,
    maxOutputSize: options.search?.maxOutputSize || 4000,
  };

  return {
    name: "plugin-large-result-handler",
    configureServer: async (server) => {
      // Add search plugin once during server configuration
      if (!searchPluginAdded) {
        const searchPlugin = createSearchPlugin(searchConfig);
        await server.addPlugin(searchPlugin);
        searchPluginAdded = true;
      }
    },
    transformTool: (tool, context) => {
      const originalExecute = tool.execute;

      tool.execute = async (args: unknown) => {
        const result = await originalExecute(args);

        const resultText = JSON.stringify(result);
        if (resultText.length <= maxSize) {
          return result;
        }

        if (!tempDir) {
          tempDir = await mkdtemp(join(tmpdir(), "mcpc-results-"));
        }

        const fileName = `${context.toolName}-${Date.now()}.txt`;
        const filePath = join(tempDir, fileName);
        await writeFile(filePath, resultText);

        const preview = resultText.slice(0, previewSize);
        return {
          content: [
            {
              type: "text",
              text: `**Result too large (${
                resultText.length
              } chars), saved to file**

📁 **File:** ${filePath}
📊 **Size:** ${(resultText.length / 1024).toFixed(1)} KB

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
      };

      return tool;
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
