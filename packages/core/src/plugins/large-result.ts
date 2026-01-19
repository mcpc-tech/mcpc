/**
 * Large Result Plugin - Handles tool results that exceed context limits
 * Enhanced with better resource management and error handling
 */

import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSearchPlugin, type SearchOptions } from "./search-tool.ts";
import type { ComposeStartContext, ToolPlugin } from "../plugin-types.ts";
import type { ComposableMCPServer } from "../compose.ts";

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

  // Store server reference and agent name
  let serverRef: ComposableMCPServer | null = null;
  let agentName: string | null = null;

  const defaultSearchDescription =
    `Grep/search within large tool result files that were saved due to size limits. ` +
    `**IMPORTANT**: You MUST execute the actual tool first and get a "Result too large, saved to file" response before using this grep tool. ` +
    `This tool is ONLY for searching within previously saved large results, not for general file search. ` +
    `Provide specific keywords or regex patterns related to the content you're looking for.`;

  return {
    name: "plugin-large-result-handler",
    version: "1.0.0",
    dependencies: [], // Search plugin will be added dynamically

    configureServer: (server) => {
      serverRef = server;
    },

    composeStart: async (context: ComposeStartContext) => {
      agentName = context.serverName;

      // Add search plugin with agent name prefix - set global: false to keep it internal
      if (serverRef) {
        const searchConfig: SearchOptions = {
          maxResults: options.search?.maxResults || 15,
          maxOutputSize: options.search?.maxOutputSize || 4000,
          toolDescription: options.search?.toolDescription ||
            defaultSearchDescription,
          global: false, // Internal tool only - not exposed externally
          agentName: agentName,
        };
        const searchPlugin = createSearchPlugin(searchConfig);
        await serverRef.addPlugin(searchPlugin);
      }
    },

    transformTool: (tool, context) => {
      const originalExecute = tool.execute;
      const searchToolName = agentName ? `${agentName}__grep` : "mcpc__grep";

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
- Use the \`${searchToolName}\` tool with pattern: \`${searchToolName} {"pattern": "your-search-term"}\`
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
      // Cleanup
      serverRef = null;
      agentName = null;
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
