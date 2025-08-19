/**
 * Built-in plugins for MCPC tool processing
 * These plugins handle core functionality like configuration, visibility, and tool name mapping
 */

export { createConfigPlugin } from "./config-plugin.ts";
export {
  createVisibilityPlugin,
  processToolVisibility,
} from "./visibility-plugin.ts";
export { createToolNameMappingPlugin } from "./tool-name-mapping-plugin.ts";

import { createConfigPlugin } from "./config-plugin.ts";
import { createVisibilityPlugin } from "./visibility-plugin.ts";
import { createToolNameMappingPlugin } from "./tool-name-mapping-plugin.ts";

/**
 * Get all built-in plugins in the correct order
 */
export function getBuiltInPlugins() {
  return [
    createToolNameMappingPlugin(), // First: establish name mappings
    createConfigPlugin(), // Second: apply configurations
    createVisibilityPlugin(), // Last: handle visibility
  ];
}
