/**
 * Search Tool Plugin
 * Adds ripgrep search functionality with result size limits
 */

import rg from "@mcpc-tech/ripgrep-napi";
import { tmpdir } from "node:os";
import { jsonSchema } from "ai";
import type { ToolPlugin } from "../plugin-types.ts";

/**
 * Configuration options for the search plugin
 */
export interface SearchOptions {
  /** Whether to enable search globally (default: true) */
  global?: boolean;
  /** Maximum number of search results to return (default: 20) */
  maxResults?: number;
  /** Maximum output size in characters (default: 5000) */
  maxOutputSize?: number;
  /** Allowed directory for search operations - restricts search scope for security (default: system temp directory) */
  allowedDir?: string;
  /** Whether search should be case sensitive (default: false) */
  caseSensitive?: boolean;
  /** Search timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
}

/**
 * Create a search plugin that adds file search capability with size limits
 */
export function createSearchPlugin(options: SearchOptions = {}): ToolPlugin {
  const maxResults = options.maxResults || 20;
  const maxOutputSize = options.maxOutputSize || 5000;
  const allowedSearchDir = options.allowedDir || tmpdir();
  const timeoutMs = options.timeoutMs || 30000;
  const global = options.global ?? true;

  return {
    name: "plugin-search",
    configureServer: (server) => {
      // Register the search tool once during plugin initialization
      server.tool(
        "search-tool-result",
        `Search files for text patterns. Allowed directory: ${allowedSearchDir}`,
        jsonSchema<{ pattern: string; path?: string; maxResults?: number }>({
          type: "object",
          properties: {
            pattern: {
              type: "string",
              description: "Text to search for",
            },
            path: {
              type: "string",
              description: "File or folder path (optional)",
            },
            maxResults: {
              type: "number",
              description: "Max results (optional)",
            },
          },
          required: ["pattern"],
        }),
        async (args: {
          pattern: string;
          path?: string;
          maxResults?: number;
        }) => {
          try {
            const requestedPath = args.path || allowedSearchDir;
            const limit = args.maxResults || maxResults;

            // Security check: Validate that the requested path is within allowed directory
            if (args.path) {
              const { resolve, relative } = await import("node:path");
              const resolvedRequested = resolve(args.path);
              const resolvedAllowed = resolve(allowedSearchDir);
              const relativePath = relative(resolvedAllowed, resolvedRequested);

              // Check if requested path is outside allowed directory
              // Empty string means same directory, anything starting with '..' means parent directory
              if (relativePath && relativePath.startsWith("..")) {
                return {
                  content: [
                    {
                      type: "text",
                      text: `❌ Path "${args.path}" not allowed. Must be within: ${allowedSearchDir}`,
                    },
                  ],
                };
              }
            }

            const searchPath = requestedPath;

            // Create timeout promise and keep reference to clear it later
            let timeoutId: ReturnType<typeof setTimeout> | undefined;
            const timeoutPromise = new Promise((_, reject) => {
              timeoutId = setTimeout(() => {
                reject(new Error(`Search timeout after ${timeoutMs}ms`));
              }, timeoutMs);
            });

            // Create search promise
            const searchPromise = new Promise((resolve, reject) => {
              try {
                const result = rg.search(args.pattern, [searchPath]);
                resolve(result);
              } catch (error) {
                reject(error);
              }
            });

            // Race between search and timeout
            const result = (await Promise.race([
              searchPromise,
              timeoutPromise,
            ])) as any;

            // Clear timeout to avoid leaking timers
            if (timeoutId) clearTimeout(timeoutId);

            if (!result.success || !result.matches?.length) {
              return {
                content: [
                  {
                    type: "text",
                    text: `No matches found for: "${args.pattern}"\n\nTry:\n- **Simpler/ pattern** or \`*\`\n- Check if files exist in: ${searchPath}\n- Use specific file path`,
                  },
                ],
              };
            }

            // Build output and check size
            const matches = result.matches.slice(0, limit);
            let output = `Found ${result.matches.length} matches (showing up to ${matches.length}):\n\n`;
            let matchesIncluded = 0;

            for (const match of matches) {
              const baseMatchText = `**${match.path}:${match.lineNumber}**\n`;
              const fullMatchText = `${baseMatchText}\`\`\`\n${match.line}\n\`\`\`\n\n`;

              // Check if adding this match would exceed size limit
              if ((output + fullMatchText).length > maxOutputSize) {
                // If we haven't shown any matches yet, show a truncated version
                if (matchesIncluded === 0) {
                  const remainingSpace = maxOutputSize - output.length - 100; // Reserve 100 chars for warning
                  if (remainingSpace > 50) {
                    // Only truncate if we have reasonable space
                    const truncatedLine = match.line.slice(0, remainingSpace);
                    output += `${baseMatchText}\`\`\`\n${truncatedLine}...\n\`\`\`\n\n`;
                    output += `⚠️ Content truncated\n`;
                    matchesIncluded++;
                  } else {
                    output += `⚠️ Content too large, use specific file path\n`;
                  }
                }
                break;
              }

              output += fullMatchText;
              matchesIncluded++;
            }

            // Add size limit warning if needed
            if (matchesIncluded < matches.length) {
              output += `\n⚠️ Showing ${matchesIncluded}/${matches.length} matches (size limit)\n`;
              output += `\nFor more results:\n`;
              output += `- Use specific pattern: "${args.pattern} keyword"\n`;
              output += `- Search specific file: {"pattern": "${args.pattern}", "path": "/file.txt"}\n`;
              output += `- Use fewer results: {"maxResults": 5}`;
            }

            return {
              content: [
                {
                  type: "text",
                  text: output,
                },
              ],
            };
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            const isTimeout = errorMsg.includes("timeout");

            return {
              content: [
                {
                  type: "text",
                  text: `Search error: ${errorMsg}\n\n${
                    isTimeout
                      ? `Timeout after ${timeoutMs}ms. Try simpler pattern or smaller directory.`
                      : `Check pattern syntax or directory exists.`
                  }`,
                },
              ],
            };
          }
        },
        { internal: !global }
      );
    },
  };
}

/**
 * Default search plugin instance with common settings
 */
const defaultSearchPlugin: ToolPlugin = createSearchPlugin({
  global: true,
  maxResults: 20,
  maxOutputSize: 5000,
  caseSensitive: false,
  timeoutMs: 30000,
});

// Export factory function for parameterized usage
export const createPlugin = createSearchPlugin;

export default defaultSearchPlugin;
