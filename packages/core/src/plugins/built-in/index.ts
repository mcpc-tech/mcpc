/**
 * Built-in plugins for MCPC tool processing
 * These plugins handle core functionality like configuration, visibility, and tool name mapping
 */

export { createConfigPlugin } from "./config-plugin.ts";
export { createToolNameMappingPlugin } from "./tool-name-mapping-plugin.ts";
export { createLoggingPlugin } from "./logging-plugin.ts";

// Import default instances
import configPlugin from "./config-plugin.ts";
import toolNameMappingPlugin from "./tool-name-mapping-plugin.ts";
import loggingPlugin from "./logging-plugin.ts";

/**
 * Get all built-in plugins in the correct order
 */
export function getBuiltInPlugins() {
  return [
    toolNameMappingPlugin, // First: establish name mappings
    configPlugin, // Second: apply configurations
    loggingPlugin, // Last: logging
  ];
}
