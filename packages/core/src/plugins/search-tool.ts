/**
 * Search Tool Plugin
 * Adds ripgrep search functionality with result size limits
 * Enhanced with better timeout management and error handling
 */

import rg from "@mcpc-tech/ripgrep-napi";
import { tmpdir } from "node:os";
import { jsonSchema } from "ai";
import type { ToolPlugin } from "../plugin-types.ts";
import { resolve } from "node:path";
import { relative } from "node:path";

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

  // Track active timeouts for cleanup
  const activeTimeouts = new Set<ReturnType<typeof setTimeout>>();

  return {
    name: "plugin-search",
    version: "1.0.0",

    configureServer: (server) => {
      // Register the search tool once during plugin initialization
      server.tool(
        "search-tool-result",
        `Search for text patterns in files and directories. Use this to find specific content, code, or information within files. Provide a simple literal string or a regular expression. If your pattern is a regex, ensure it's valid; otherwise use quotes or escape special characters to treat it as a literal string.
Only search within the allowed directory: ${allowedSearchDir}`,
        jsonSchema<{ pattern: string; path?: string; maxResults?: number }>({
          type: "object",
          properties: {
            pattern: {
              type: "string",
              description:
                "Text to search for. Can be a plain string or a regular expression. For regexes, don't include delimiters (e.g. use `^foo` not `/^foo/`). If you get a regex parse error, try escaping special chars or using a simpler literal search.",
            },
            path: {
              type: "string",
              description:
                "File or folder path to limit the search (optional). Must be within the allowed directory.",
            },
            maxResults: {
              type: "number",
              description:
                "Maximum number of matches to return (optional). Lower this to reduce output size and runtime.",
            },
          },
          required: ["pattern"],
        }),
        async (args: {
          pattern: string;
          path?: string;
          maxResults?: number;
        }) => {
          const isBroad = (raw: string) => {
            const t = (raw ?? "").trim();
            if (!t) return true;
            // only-wildcards when length >=2 (single '*' allowed)
            if (/^[*.\s]{2,}$/.test(t)) return true;
            if (t === ".*" || t === "." || t === "^.*$") return true;
            if (/^\^?\.\*\$?$/.test(t)) return true;
            if (/^\\s?\*+$/.test(t)) return true;
            return false;
          };

          const appendMatchSafely = (
            current: string,
            addition: string,
            limit: number,
          ) => {
            if ((current + addition).length > limit) {
              return { current, added: false };
            }
            return { current: current + addition, added: true };
          };

          let timeoutId: ReturnType<typeof setTimeout> | undefined;

          try {
            const requestedPath = args.path || allowedSearchDir;
            const limit = args.maxResults || maxResults;

            // Security check: Validate that the requested path is within allowed directory
            if (args.path) {
              const resolvedRequested = resolve(args.path);
              const resolvedAllowed = resolve(allowedSearchDir);
              const relativePath = relative(resolvedAllowed, resolvedRequested);

              // Check if requested path is outside allowed directory
              if (relativePath && relativePath.startsWith("..")) {
                return {
                  content: [
                    {
                      type: "text",
                      text:
                        `❌ Path "${args.path}" not allowed. Must be within: ${allowedSearchDir}`,
                    },
                  ],
                  isError: true,
                };
              }
            }

            const searchPath = requestedPath;

            // Reject overly-broad patterns
            const rawPattern = args.pattern ?? "";
            if (isBroad(rawPattern)) {
              return {
                content: [
                  {
                    type: "text",
                    text:
                      `❌ Search pattern too broad: "${rawPattern}"\nProvide a more specific pattern (e.g. include a filename fragment, a keyword, or limit with the "path" parameter). Avoid patterns that only contain wildcards like "*" or ".*".`,
                  },
                ],
                isError: true,
              };
            }

            // Create timeout promise with cleanup tracking
            const timeoutPromise = new Promise((_, reject) => {
              timeoutId = setTimeout(() => {
                reject(new Error(`Search timeout after ${timeoutMs}ms`));
              }, timeoutMs);
              activeTimeouts.add(timeoutId);
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

            // Clear timeout immediately after completion
            if (timeoutId) {
              clearTimeout(timeoutId);
              activeTimeouts.delete(timeoutId);
            }

            if (!result.success || !result.matches?.length) {
              return {
                content: [
                  {
                    type: "text",
                    text:
                      `No matches found for: "${args.pattern}"\n\nTry:\n- **Simpler pattern** or \`*\`\n- Check if files exist in: ${searchPath}\n- Use specific file path`,
                  },
                ],
              };
            }

            // Build output and check size
            const matches = result.matches.slice(0, limit);
            let output =
              `Found ${result.matches.length} matches (showing up to ${matches.length}):\n\n`;
            let matchesIncluded = 0;

            for (const match of matches) {
              const baseMatchText = `**${match.path}:${match.lineNumber}**\n`;
              const fullMatchText =
                `${baseMatchText}\`\`\`\n${match.line}\n\`\`\`\n\n`;

              const res = appendMatchSafely(
                output,
                fullMatchText,
                maxOutputSize,
              );
              if (!res.added) {
                // If we haven't shown any matches yet, show a truncated version
                if (matchesIncluded === 0) {
                  const remainingSpace = maxOutputSize - output.length - 100;
                  if (remainingSpace > 50) {
                    const truncatedLine = match.line.slice(0, remainingSpace);
                    output +=
                      `${baseMatchText}\`\`\`\n${truncatedLine}...\n\`\`\`\n\n`;
                    output += `⚠️ Content truncated\n`;
                    matchesIncluded++;
                  } else {
                    output += `⚠️ Content too large, use specific file path\n`;
                  }
                }
                break;
              }

              output = res.current;
              matchesIncluded++;
            }

            // Add size limit warning if needed
            if (matchesIncluded < matches.length) {
              output +=
                `\n⚠️ Showing ${matchesIncluded}/${matches.length} matches (size limit)\n`;
              output += `\nFor more results:\n`;
              output += `- Use specific pattern: "${args.pattern} keyword"\n`;
              output +=
                `- Search specific file: {"pattern": "${args.pattern}", "path": "/file.txt"}\n`;
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
            // Clean up timeout on error
            if (timeoutId) {
              clearTimeout(timeoutId);
              activeTimeouts.delete(timeoutId);
            }

            const errorMsg = error instanceof Error
              ? error.message
              : String(error);
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
        { internal: !global },
      );
    },

    dispose: () => {
      // Clean up any remaining timeouts
      for (const timeoutId of activeTimeouts) {
        clearTimeout(timeoutId);
      }
      activeTimeouts.clear();
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
