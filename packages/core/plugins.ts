/**
 * MCPC Core Plugins
 *
 * Collection of built-in and utility plugins for MCPC servers.
 *
 * @example
 * ```ts
 * import { createSearchPlugin, createLargeResultPlugin } from "@mcpc/core/plugins";
 *
 * const server = await mcpc([...], [...]);
 *
 * // Add search functionality
 * await server.addPlugin(createSearchPlugin({
 *   maxResults: 50,
 *   searchDir: "./workspace"
 * }));
 *
 * // Add large result handling
 * await server.addPlugin(createLargeResultPlugin({
 *   maxSize: 10000
 * }));
 * ```
 *
 * @module
 */

// Export all plugin creators
export { createSearchPlugin } from "./src/plugins/search-tool.ts";
export { createLargeResultPlugin } from "./src/plugins/large-result.ts";

// Export plugin types for advanced users
export type { ToolPlugin } from "./src/compose.ts";
