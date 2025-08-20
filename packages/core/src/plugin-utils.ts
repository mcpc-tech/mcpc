/**
 * Plugin utility functions for MCP server composition
 * Simple helper functions following KISS principle
 */

import type { ToolPlugin } from "./plugin-types.ts";

/**
 * Check if a plugin should be applied based on its conditions
 */
export function shouldApplyPlugin(
  plugin: ToolPlugin, 
  mode: "agentic" | "agentic_workflow"
): boolean {
  if (!plugin.apply) return true;
  
  if (typeof plugin.apply === "string") {
    return mode.includes(plugin.apply);
  }
  
  if (typeof plugin.apply === "function") {
    return plugin.apply(mode);
  }
  
  return plugin.apply;
}

/**
 * Sort plugins by enforcement order
 */
export function sortPluginsByOrder<T extends { enforce?: "pre" | "post" }>(plugins: T[]): T[] {
  return [
    ...plugins.filter((p) => p.enforce === "pre"),
    ...plugins.filter((p) => !p.enforce),
    ...plugins.filter((p) => p.enforce === "post"),
  ];
}

/**
 * Filter plugins that have a specific hook
 */
export function getPluginsWithHook<K extends keyof ToolPlugin>(
  plugins: ToolPlugin[],
  hookName: K
): ToolPlugin[] {
  return plugins.filter((p) => p[hookName]);
}

/**
 * Validate plugin format
 */
export function isValidPlugin(plugin: any): plugin is ToolPlugin {
  return plugin && 
         plugin.name && 
         (plugin.configureServer ||
          plugin.composeStart ||
          plugin.transformTool ||
          plugin.finalizeComposition ||
          plugin.composeEnd);
}

/**
 * Load a plugin from a file path with optional parameters
 */
export async function loadPlugin(pluginPath: string): Promise<ToolPlugin> {
  try {
    // Parse path and query parameters
    const [rawPath, queryString] = pluginPath.split('?', 2);
    const searchParams = new URLSearchParams(queryString || '');
    const params = Object.fromEntries(searchParams.entries());

    // Use relative import - let Deno/Node resolve the path relative to the importing module
    const pluginModule = await import(rawPath);
    
    // Get factory function and default plugin separately
    const pluginFactory = pluginModule.createPlugin;
    const defaultPlugin = pluginModule.default;
    
    let plugin;
    if (Object.keys(params).length > 0) {
      // Has parameters - use factory function
      if (typeof pluginFactory === "function") {
        // Convert string values to appropriate types
        const typedParams: Record<string, any> = {};
        for (const [key, value] of Object.entries(params)) {
          const numValue = Number(value);
          if (!isNaN(numValue)) {
            typedParams[key] = numValue;
          } else if (value === 'true') {
            typedParams[key] = true;
          } else if (value === 'false') {
            typedParams[key] = false;
          } else {
            typedParams[key] = value;
          }
        }
        plugin = pluginFactory(typedParams);
      } else {
        throw new Error(`Plugin ${rawPath} has parameters but no createPlugin export`);
      }
    } else {
      // No parameters - use default plugin
      plugin = defaultPlugin;
    }
    
    if (isValidPlugin(plugin)) {
      return plugin;
    } else {
      throw new Error(`Invalid plugin format in ${rawPath} - plugin must have a name and at least one lifecycle hook`);
    }
  } catch (error) {
    throw new Error(`Failed to load plugin from ${pluginPath}: ${error}`);
  }
}
