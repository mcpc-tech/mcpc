/**
 * Plugin management utilities for ComposableMCPServer
 * Handles plugin registration, validation, and lifecycle execution
 */

import type {
  ComposedTool,
  ComposeEndContext,
  ComposeStartContext,
  FinalizeContext,
  ToolPlugin,
  TransformContext,
} from "../plugin-types.ts";
import {
  loadPlugin,
  shouldApplyPlugin,
  sortPluginsByOrder,
  validatePlugins,
} from "../plugin-utils.ts";
import { createLogger } from "./logger.ts";
import type { ComposableMCPServer } from "../compose.ts";

/**
 * Manages plugin lifecycle and execution for MCP server composition
 */
export class PluginManager {
  private plugins: ToolPlugin[] = [];
  private logger = createLogger("mcpc.plugin-manager");

  constructor(private server: ComposableMCPServer) {
    this.logger.setServer(server);
  }

  /**
   * Get all registered plugins
   */
  getPlugins(): ToolPlugin[] {
    return [...this.plugins];
  }

  /**
   * Get plugin names
   */
  getPluginNames(): string[] {
    return this.plugins.map((p) => p.name);
  }

  /**
   * Check if a plugin is registered
   */
  hasPlugin(name: string): boolean {
    return this.plugins.some((p) => p.name === name);
  }

  /**
   * Add a plugin with validation and error handling
   */
  async addPlugin(plugin: ToolPlugin): Promise<void> {
    // Validate plugin
    const validation = validatePlugins([plugin]);
    if (!validation.valid) {
      const errorMsg = validation.errors.join(", ");
      throw new Error(`Invalid plugin "${plugin.name}": ${errorMsg}`);
    }

    // Check for duplicate
    if (this.plugins.some((p) => p.name === plugin.name)) {
      await this.logger.warning(
        `Plugin "${plugin.name}" already registered, skipping`,
      );
      return;
    }

    // Check dependencies
    if (plugin.dependencies) {
      const missingDeps = plugin.dependencies.filter(
        (dep: string) => !this.plugins.some((p) => p.name === dep),
      );
      if (missingDeps.length > 0) {
        throw new Error(
          `Plugin "${plugin.name}" has missing dependencies: ${
            missingDeps.join(", ")
          }`,
        );
      }
    }

    // Add to plugins list first
    this.plugins.push(plugin);

    // Call configureServer hook with error handling
    if (plugin.configureServer) {
      try {
        await plugin.configureServer(this.server);
      } catch (error) {
        // Remove plugin if configuration fails
        this.plugins = this.plugins.filter((p) => p.name !== plugin.name);
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Plugin "${plugin.name}" configuration failed: ${errorMsg}`,
        );
      }
    }
  }

  /**
   * Load and register a plugin from a file path
   */
  async loadPluginFromPath(
    pluginPath: string,
    options: { cache?: boolean } = { cache: true },
  ): Promise<void> {
    const plugin = await loadPlugin(pluginPath, options);
    await this.addPlugin(plugin);
  }

  /**
   * Trigger composeStart hooks for all applicable plugins
   */
  async triggerComposeStart(context: ComposeStartContext): Promise<void> {
    const startPlugins = this.plugins.filter(
      (p) => p.composeStart && shouldApplyPlugin(p, context.mode),
    );

    const sortedPlugins = sortPluginsByOrder(startPlugins);

    for (const plugin of sortedPlugins) {
      if (plugin.composeStart) {
        try {
          await plugin.composeStart(context);
        } catch (error) {
          const errorMsg = error instanceof Error
            ? error.message
            : String(error);
          await this.logger.error(
            `Plugin "${plugin.name}" composeStart failed: ${errorMsg}`,
          );
        }
      }
    }
  }

  /**
   * Apply transformTool hooks to a tool during composition
   */
  async applyTransformToolHooks(
    tool: ComposedTool,
    context: TransformContext,
  ): Promise<ComposedTool> {
    const transformPlugins = this.plugins.filter(
      (p) => p.transformTool && shouldApplyPlugin(p, context.mode),
    );

    if (transformPlugins.length === 0) {
      return tool;
    }

    const sortedPlugins = sortPluginsByOrder(transformPlugins);
    let currentTool = tool;

    for (const plugin of sortedPlugins) {
      if (plugin.transformTool) {
        try {
          const result = await plugin.transformTool(currentTool, context);
          if (result) {
            currentTool = result;
          }
        } catch (error) {
          const errorMsg = error instanceof Error
            ? error.message
            : String(error);
          await this.logger.error(
            `Plugin "${plugin.name}" transformTool failed for "${context.toolName}": ${errorMsg}`,
          );
        }
      }
    }

    return currentTool;
  }

  /**
   * Trigger finalizeComposition hooks for all applicable plugins
   */
  async triggerFinalizeComposition(
    tools: Record<string, ComposedTool>,
    context: FinalizeContext,
  ): Promise<void> {
    const finalizePlugins = this.plugins.filter(
      (p) => p.finalizeComposition && shouldApplyPlugin(p, context.mode),
    );

    const sortedPlugins = sortPluginsByOrder(finalizePlugins);

    for (const plugin of sortedPlugins) {
      if (plugin.finalizeComposition) {
        try {
          await plugin.finalizeComposition(tools, context);
        } catch (error) {
          const errorMsg = error instanceof Error
            ? error.message
            : String(error);
          await this.logger.error(
            `Plugin "${plugin.name}" finalizeComposition failed: ${errorMsg}`,
          );
        }
      }
    }
  }

  /**
   * Trigger composeEnd hooks for all applicable plugins
   */
  async triggerComposeEnd(context: ComposeEndContext): Promise<void> {
    const endPlugins = this.plugins.filter(
      (p) => p.composeEnd && shouldApplyPlugin(p, context.mode),
    );

    const sortedPlugins = sortPluginsByOrder(endPlugins);

    for (const plugin of sortedPlugins) {
      if (plugin.composeEnd) {
        try {
          await plugin.composeEnd(context);
        } catch (error) {
          const errorMsg = error instanceof Error
            ? error.message
            : String(error);
          await this.logger.error(
            `Plugin "${plugin.name}" composeEnd failed: ${errorMsg}`,
          );
        }
      }
    }
  }

  /**
   * Dispose all plugins and cleanup resources
   */
  async dispose(): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.dispose) {
        try {
          await plugin.dispose();
        } catch (error) {
          const errorMsg = error instanceof Error
            ? error.message
            : String(error);
          await this.logger.error(
            `Plugin "${plugin.name}" dispose failed: ${errorMsg}`,
          );
        }
      }
    }
    this.plugins = [];
  }
}
