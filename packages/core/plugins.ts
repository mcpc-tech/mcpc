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
 * @example Using default plugin instances
 * ```ts
 * // Import individual plugins with default configurations
 * import searchPlugin from "@mcpc/core/plugins/search";
 * import largeResultPlugin from "@mcpc/core/plugins/large-result";
 *
 * const server = await mcpc([...], [...]);
 *
 * // Use plugins with default settings
 * await server.addPlugin(searchPlugin);
 * await server.addPlugin(largeResultPlugin);
 * ```
 *
 * @module
 */

// Export all plugin creators
export { createSearchPlugin } from "./src/plugins/search-tool.ts";
export { createLargeResultPlugin } from "./src/plugins/large-result.ts";
export { createSkillsPlugin } from "./src/plugins/skills.ts";
export { createBashPlugin } from "./src/plugins/bash.ts";

// Export default plugin instances for convenience
export { default as defaultSearchPlugin } from "./src/plugins/search-tool.ts";
export { default as defaultLargeResultPlugin } from "./src/plugins/large-result.ts";

// Export plugin types for advanced users
export type { SearchOptions } from "./src/plugins/search-tool.ts";
