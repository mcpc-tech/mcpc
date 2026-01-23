/**
 * Plugin management utilities for ComposableMCPServer
 * Handles plugin registration, validation, and lifecycle execution
 */

import type {
  AfterToolExecuteContext,
  AfterToolExecuteResult,
  AgentToolRegistrationContext,
  BeforeToolExecuteContext,
  BeforeToolExecuteResult,
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
   * Trigger registerAgentTool hook - allows plugins to register the main agent tool
   * Returns true if any plugin handled the registration
   * Throws the original error if plugin fails (instead of swallowing it)
   */
  async triggerRegisterAgentTool(
    context: AgentToolRegistrationContext,
  ): Promise<boolean> {
    const registerPlugins = this.plugins.filter(
      (p) => p.registerAgentTool && shouldApplyPlugin(p, context.mode),
    );

    if (registerPlugins.length === 0) {
      return false;
    }

    // Sort plugins - last one wins (reverse order)
    const sortedPlugins = sortPluginsByOrder(registerPlugins).reverse();

    for (const plugin of sortedPlugins) {
      if (plugin.registerAgentTool) {
        // Don't catch errors here - let them propagate so the caller
        // can see the actual error message (e.g., "ai_acp mode requires acpSettings")
        await plugin.registerAgentTool(context);
        // First successful registration wins
        return true;
      }
    }

    return false;
  }

  // === Tool Execution Lifecycle Hooks ===

  /**
   * Trigger beforeToolExecute hooks for all applicable plugins
   * Returns the combined result from all plugins
   *
   * Hook execution order:
   * 1. 'pre' enforced plugins first
   * 2. Normal plugins (no enforce)
   * 3. 'post' enforced plugins last
   *
   * If any plugin returns skipExecution=true, execution is skipped
   * and the result from that plugin is used.
   */
  async triggerBeforeToolExecute(
    context: BeforeToolExecuteContext,
  ): Promise<BeforeToolExecuteResult | undefined> {
    const beforePlugins = this.plugins.filter((p) => p.beforeToolExecute);

    if (beforePlugins.length === 0) {
      return undefined;
    }

    const sortedPlugins = sortPluginsByOrder(beforePlugins);
    let currentArgs = context.args;
    let combinedMetadata: Record<string, unknown> = {};

    for (const plugin of sortedPlugins) {
      if (plugin.beforeToolExecute) {
        try {
          const result = await plugin.beforeToolExecute({
            ...context,
            args: currentArgs,
          });

          if (result) {
            // Merge metadata
            if (result.metadata) {
              combinedMetadata = { ...combinedMetadata, ...result.metadata };
            }

            // If plugin wants to skip execution, return immediately
            if (result.skipExecution) {
              return {
                skipExecution: true,
                result: result.result,
                metadata: combinedMetadata,
              };
            }

            // Update args if modified
            if (result.modifiedArgs !== undefined) {
              currentArgs = result.modifiedArgs;
            }
          }
        } catch (error) {
          const errorMsg = error instanceof Error
            ? error.message
            : String(error);
          await this.logger.error(
            `Plugin "${plugin.name}" beforeToolExecute failed for "${context.toolName}": ${errorMsg}`,
          );
        }
      }
    }

    // If args were modified, return the modified args
    if (currentArgs !== context.args) {
      return {
        modifiedArgs: currentArgs,
        metadata: Object.keys(combinedMetadata).length > 0
          ? combinedMetadata
          : undefined,
      };
    }

    // Return metadata if any was collected
    if (Object.keys(combinedMetadata).length > 0) {
      return { metadata: combinedMetadata };
    }

    return undefined;
  }

  /**
   * Trigger afterToolExecute hooks for all applicable plugins
   * Returns the final result after all plugins have processed it
   */
  async triggerAfterToolExecute(
    context: AfterToolExecuteContext,
  ): Promise<AfterToolExecuteResult | undefined> {
    const afterPlugins = this.plugins.filter((p) => p.afterToolExecute);

    if (afterPlugins.length === 0) {
      return undefined;
    }

    const sortedPlugins = sortPluginsByOrder(afterPlugins);
    let currentResult = context.result;
    let markAsError = context.isError;

    for (const plugin of sortedPlugins) {
      if (plugin.afterToolExecute) {
        try {
          const result = await plugin.afterToolExecute({
            ...context,
            result: currentResult,
            isError: markAsError,
          });

          if (result) {
            // Update result if modified
            if (result.modifiedResult !== undefined) {
              currentResult = result.modifiedResult;
            }

            // Update error status if specified
            if (result.markAsError !== undefined) {
              markAsError = result.markAsError;
            }
          }
        } catch (error) {
          const errorMsg = error instanceof Error
            ? error.message
            : String(error);
          await this.logger.error(
            `Plugin "${plugin.name}" afterToolExecute failed for "${context.toolName}": ${errorMsg}`,
          );
        }
      }
    }

    // Return result if it was modified or error status changed
    if (currentResult !== context.result || markAsError !== context.isError) {
      return {
        modifiedResult: currentResult,
        markAsError,
      };
    }

    return undefined;
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
