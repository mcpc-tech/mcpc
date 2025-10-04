/**
 * Plugin utility functions for MCP server composition
 * Optimized helper functions following KISS principle
 */

import type { ToolPlugin } from "./plugin-types.ts";

/**
 * Plugin cache for file-based plugins to avoid redundant loading
 */
const pluginCache = new Map<string, ToolPlugin>();

/**
 * Check if a plugin should be applied based on its conditions
 */
export function shouldApplyPlugin(
  plugin: ToolPlugin,
  mode: "agentic" | "agentic_workflow",
): boolean {
  if (!plugin.apply) return true;

  if (typeof plugin.apply === "string") {
    return mode.includes(plugin.apply);
  }

  if (typeof plugin.apply === "function") {
    try {
      return plugin.apply(mode);
    } catch (error) {
      console.warn(
        `Plugin "${plugin.name}" apply function failed: ${error}. Defaulting to true.`,
      );
      return true;
    }
  }

  return true;
}

/**
 * Sort plugins by enforcement order and dependency resolution
 * Returns plugins in the correct execution order
 */
export function sortPluginsByOrder(plugins: ToolPlugin[]): ToolPlugin[] {
  // Build dependency graph
  const pluginMap = new Map<string, ToolPlugin>();
  for (const plugin of plugins) {
    pluginMap.set(plugin.name, plugin);
  }

  // Topological sort with enforcement order
  const visited = new Set<string>();
  const sorted: ToolPlugin[] = [];

  function visit(plugin: ToolPlugin) {
    if (visited.has(plugin.name)) return;
    visited.add(plugin.name);

    // Visit dependencies first
    if (plugin.dependencies) {
      for (const depName of plugin.dependencies) {
        const dep = pluginMap.get(depName);
        if (dep) {
          visit(dep);
        } else {
          console.warn(
            `Plugin "${plugin.name}" depends on "${depName}" which is not loaded`,
          );
        }
      }
    }

    sorted.push(plugin);
  }

  // Sort by enforcement: pre plugins first, then normal, then post
  const prePlugins = plugins.filter((p) => p.enforce === "pre");
  const normalPlugins = plugins.filter((p) => !p.enforce);
  const postPlugins = plugins.filter((p) => p.enforce === "post");

  // Visit in enforcement order, respecting dependencies
  [...prePlugins, ...normalPlugins, ...postPlugins].forEach(visit);

  return sorted;
}

/**
 * Filter plugins that have a specific hook
 */
export function getPluginsWithHook<K extends keyof ToolPlugin>(
  plugins: ToolPlugin[],
  hookName: K,
): ToolPlugin[] {
  return plugins.filter((p) => typeof p[hookName] === "function");
}

/**
 * Validate plugin format with comprehensive checks
 */
export function isValidPlugin(plugin: unknown): plugin is ToolPlugin {
  if (!plugin || typeof plugin !== "object") return false;

  const p = plugin as Partial<ToolPlugin>;

  // Must have a name
  if (!p.name || typeof p.name !== "string" || p.name.trim() === "") {
    return false;
  }

  // Must have at least one lifecycle hook
  const hasHook = typeof p.configureServer === "function" ||
    typeof p.composeStart === "function" ||
    typeof p.transformTool === "function" ||
    typeof p.finalizeComposition === "function" ||
    typeof p.composeEnd === "function" ||
    typeof p.transformInput === "function" ||
    typeof p.transformOutput === "function" ||
    typeof p.dispose === "function";

  if (!hasHook) return false;

  // Validate optional fields
  if (p.enforce && p.enforce !== "pre" && p.enforce !== "post") {
    return false;
  }

  if (
    p.apply &&
    typeof p.apply !== "string" &&
    typeof p.apply !== "function"
  ) {
    return false;
  }

  if (p.dependencies && !Array.isArray(p.dependencies)) {
    return false;
  }

  return true;
}

/**
 * Parse query parameters and convert to typed values
 */
function parseQueryParams(
  params: Record<string, string>,
): Record<string, unknown> {
  const typedParams: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    // Try number conversion
    const numValue = Number(value);
    if (!isNaN(numValue) && value.trim() !== "") {
      typedParams[key] = numValue;
      continue;
    }

    // Boolean conversion
    if (value === "true") {
      typedParams[key] = true;
      continue;
    }
    if (value === "false") {
      typedParams[key] = false;
      continue;
    }

    // Array conversion (comma-separated)
    if (value.includes(",")) {
      typedParams[key] = value.split(",").map((v) => v.trim());
      continue;
    }

    // Default to string
    typedParams[key] = value;
  }

  return typedParams;
}

/**
 * Load a plugin from a file path with optional parameters
 * Supports caching to avoid redundant imports
 */
export async function loadPlugin(
  pluginPath: string,
  options: { cache?: boolean } = { cache: true },
): Promise<ToolPlugin> {
  // Check cache first
  if (options.cache && pluginCache.has(pluginPath)) {
    return pluginCache.get(pluginPath)!;
  }

  try {
    // Parse path and query parameters
    const [rawPath, queryString] = pluginPath.split("?", 2);
    const searchParams = new URLSearchParams(queryString || "");
    const params = Object.fromEntries(searchParams.entries());

    // Dynamic import with cache busting for development
    const importPath = rawPath;
    const pluginModule = await import(importPath);

    // Get factory function and default plugin
    const pluginFactory = pluginModule.createPlugin;
    const defaultPlugin = pluginModule.default;

    let plugin: ToolPlugin;

    if (Object.keys(params).length > 0) {
      // Has parameters - use factory function
      if (typeof pluginFactory !== "function") {
        throw new Error(
          `Plugin "${rawPath}" has parameters but no createPlugin export function`,
        );
      }

      const typedParams = parseQueryParams(params);
      plugin = pluginFactory(typedParams);
    } else {
      // No parameters - use default plugin or factory with no args
      if (defaultPlugin) {
        plugin = defaultPlugin;
      } else if (typeof pluginFactory === "function") {
        plugin = pluginFactory();
      } else {
        throw new Error(
          `Plugin "${rawPath}" has no default export or createPlugin function`,
        );
      }
    }

    if (!isValidPlugin(plugin)) {
      throw new Error(
        `Invalid plugin format in "${rawPath}": must have a unique name and at least one lifecycle hook`,
      );
    }

    // Cache the plugin
    if (options.cache) {
      pluginCache.set(pluginPath, plugin);
    }

    return plugin;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load plugin from "${pluginPath}": ${errorMsg}`);
  }
}

/**
 * Clear plugin cache (useful for testing or hot reload)
 */
export function clearPluginCache(): void {
  pluginCache.clear();
}

/**
 * Check for circular dependencies in plugin list
 */
export function checkCircularDependencies(plugins: ToolPlugin[]): string[] {
  const errors: string[] = [];
  const pluginMap = new Map<string, ToolPlugin>();

  for (const plugin of plugins) {
    pluginMap.set(plugin.name, plugin);
  }

  function checkCircular(
    pluginName: string,
    visited: Set<string>,
    path: string[],
  ): void {
    if (visited.has(pluginName)) {
      const cycle = [...path, pluginName].join(" -> ");
      errors.push(`Circular dependency detected: ${cycle}`);
      return;
    }

    const plugin = pluginMap.get(pluginName);
    if (!plugin || !plugin.dependencies) return;

    visited.add(pluginName);
    path.push(pluginName);

    for (const dep of plugin.dependencies) {
      checkCircular(dep, new Set(visited), [...path]);
    }
  }

  for (const plugin of plugins) {
    checkCircular(plugin.name, new Set(), []);
  }

  return errors;
}

/**
 * Validate all plugins in a list
 */
export function validatePlugins(
  plugins: ToolPlugin[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for duplicate names
  const names = new Map<string, number>();
  for (const plugin of plugins) {
    const count = names.get(plugin.name) || 0;
    names.set(plugin.name, count + 1);
  }

  for (const [name, count] of names.entries()) {
    if (count > 1) {
      errors.push(`Duplicate plugin name: "${name}" (${count} instances)`);
    }
  }

  // Check circular dependencies
  const circularErrors = checkCircularDependencies(plugins);
  errors.push(...circularErrors);

  // Validate each plugin
  for (const plugin of plugins) {
    if (!isValidPlugin(plugin)) {
      const name = (plugin as Partial<ToolPlugin>).name || "unknown";
      errors.push(`Invalid plugin: "${name}"`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
