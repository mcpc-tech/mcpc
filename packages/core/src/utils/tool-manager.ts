/**
 * Tool management utilities for ComposableMCPServer
 * Handles tool registry, configuration, and name resolution
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ComposedTool, ToolConfig } from "../plugin-types.ts";
import type { JSONSchema, ToolCallback } from "../types.ts";
import { jsonSchema } from "./schema.ts";

/**
 * Manages tool registration, configuration, and resolution
 */
export class ToolManager {
  private toolRegistry = new Map<
    string,
    {
      callback: ToolCallback;
      description: string;
      inputSchema?: JSONSchema;
      outputSchema?: JSONSchema;
    }
  >();
  private toolConfigs = new Map<string, ToolConfig>();
  private toolNameMapping = new Map<string, string>();
  private publicTools: Tool[] = [];

  /**
   * Get tool name mapping (for external access)
   */
  getToolNameMapping(): Map<string, string> {
    return this.toolNameMapping;
  }

  /**
   * Register a tool in the registry
   */
  registerTool(
    name: string,
    description: string,
    inputSchema: JSONSchema | undefined,
    callback: ToolCallback,
    options: {
      internal?: boolean;
      hidden?: boolean;
      outputSchema?: JSONSchema;
    } = {},
  ): void {
    this.toolRegistry.set(name, {
      callback,
      description,
      inputSchema,
      outputSchema: options.outputSchema,
    });

    // Set visibility config based on options
    // - internal: not exposed to MCP clients (not added to publicTools)
    // - hidden: excluded from agent context (not visible in tool enum)
    if (options.hidden) {
      this.toolConfigs.set(name, { visibility: { hidden: true } });
    }
    // Note: Tools are NOT automatically added to publicTools here
    // Only explicitly public tools should be added via addPublicTool()
  }

  /**
   * Explicitly mark a tool as public (exposed to MCP clients)
   */
  addPublicTool(
    name: string,
    description: string,
    inputSchema: JSONSchema | undefined,
    outputSchema?: JSONSchema,
  ): void {
    const existingTool = this.publicTools.find((t) => t.name === name);
    if (!existingTool) {
      this.publicTools.push({
        name,
        description,
        inputSchema: inputSchema as Tool["inputSchema"],
        ...(outputSchema
          ? { outputSchema: outputSchema as Tool["outputSchema"] }
          : {}),
      });
    }
    // Mark as public in toolConfigs for getPublicToolNames()
    this.toolConfigs.set(name, { visibility: { public: true } });
  }

  /**
   * Check if a tool is public (exposed to MCP clients)
   */
  isPublic(name: string): boolean {
    const config = this.toolConfigs.get(name);
    return config?.visibility?.public === true;
  }

  /**
   * Check if a tool is hidden from agent context
   */
  isHidden(name: string): boolean {
    const config = this.toolConfigs.get(name);
    return config?.visibility?.hidden === true;
  }

  /**
   * Get all public tool names (exposed to MCP clients)
   */
  getPublicToolNames(): string[] {
    return Array.from(this.toolConfigs.entries())
      .filter(([_name, config]) => config.visibility?.public === true)
      .map(([name]) => this.resolveToolName(name) ?? name);
  }

  /**
   * Get all hidden tool names
   */
  getHiddenToolNames(): string[] {
    return Array.from(this.toolConfigs.entries())
      .filter(([_name, config]) => config.visibility?.hidden === true)
      .map(([name]) => this.resolveToolName(name) ?? name);
  }

  /**
   * Get all public tools
   */
  getPublicTools(): Tool[] {
    return [...this.publicTools];
  }

  /**
   * Set public tools list
   */
  setPublicTools(tools: Tool[]): void {
    this.publicTools = [...tools];
  }

  /**
   * Get tool callback by name
   */
  getToolCallback(name: string): ToolCallback | undefined {
    return this.toolRegistry.get(name)?.callback;
  }

  /**
   * Check if tool exists in registry
   */
  hasToolNamed(name: string): boolean {
    return (
      this.toolRegistry.has(name) ||
      (this.toolNameMapping.has(name) &&
        this.toolRegistry.has(this.toolNameMapping.get(name)!))
    );
  }

  /**
   * Resolve a tool name to its internal format
   */
  resolveToolName(name: string): string | undefined {
    // Try exact match in runtime registry first
    if (this.toolRegistry.has(name)) {
      return name;
    }

    // Try mapping lookup
    const mappedName = this.toolNameMapping.get(name);
    if (mappedName && this.toolRegistry.has(mappedName)) {
      return mappedName;
    }

    // Check if name corresponds to a configured alias
    if (this.toolConfigs.has(name)) {
      const cfgMapped = this.toolNameMapping.get(name);
      if (cfgMapped && this.toolRegistry.has(cfgMapped)) {
        return cfgMapped;
      }
    }

    return undefined;
  }

  /**
   * Configure tool behavior
   */
  configTool(toolName: string, config: ToolConfig): void {
    this.toolConfigs.set(toolName, config);
  }

  /**
   * Get tool configuration
   */
  getToolConfig(toolName: string): ToolConfig | undefined {
    return this.toolConfigs.get(toolName);
  }

  /**
   * Find tool configuration (with mapping fallback)
   */
  findToolConfig(toolId: string): ToolConfig | undefined {
    const directConfig = this.toolConfigs.get(toolId);
    if (directConfig) {
      return directConfig;
    }

    const mappedName = this.toolNameMapping.get(toolId);
    if (mappedName && this.toolConfigs.has(mappedName)) {
      return this.toolConfigs.get(mappedName);
    }

    return undefined;
  }

  /**
   * Remove tool configuration
   */
  removeToolConfig(toolName: string): boolean {
    return this.toolConfigs.delete(toolName);
  }

  /**
   * Set tool name mapping
   */
  setToolNameMapping(from: string, to: string): void {
    this.toolNameMapping.set(from, to);
  }

  /**
   * Get tool schema if it's hidden (for internal access)
   */
  getHiddenToolSchema(
    name: string,
  ):
    | {
      description: string;
      inputSchema: JSONSchema;
      outputSchema?: JSONSchema;
    }
    | undefined {
    const tool = this.toolRegistry.get(name);
    const config = this.toolConfigs.get(name);
    if (tool && config?.visibility?.hidden && tool.inputSchema) {
      return {
        description: tool.description,
        inputSchema: tool.inputSchema,
        ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
      };
    }
    return undefined;
  }

  /**
   * Get total tool count
   */
  getTotalToolCount(): number {
    return this.toolRegistry.size;
  }

  /**
   * Get all tool entries
   */
  getToolEntries(): [
    string,
    {
      callback: ToolCallback;
      description: string;
      inputSchema?: JSONSchema;
      outputSchema?: JSONSchema;
    },
  ][] {
    return Array.from(this.toolRegistry.entries());
  }

  /**
   * Get tool registry (for external access)
   */
  getToolRegistry(): Map<
    string,
    {
      callback: ToolCallback;
      description: string;
      inputSchema?: JSONSchema;
      outputSchema?: JSONSchema;
    }
  > {
    return this.toolRegistry;
  }

  /**
   * Get all registered tools as ComposedTool objects
   * This includes tools registered via server.tool() in setup hooks
   */
  getRegisteredToolsAsComposed(): Record<string, any> {
    const composedTools: Record<string, any> = {};

    for (const [name, tool] of this.toolRegistry.entries()) {
      if (this.toolConfigs.get(name)?.visibility?.public === true) {
        continue;
      }
      composedTools[name] = {
        name,
        description: tool.description,
        inputSchema: jsonSchema(
          tool.inputSchema || { type: "object", properties: {} },
        ),
        ...(tool.outputSchema
          ? { outputSchema: jsonSchema(tool.outputSchema) }
          : {}),
        execute: tool.callback,
      };
    }

    return composedTools;
  }

  /**
   * Get a single tool as ComposedTool object by name
   */
  getComposedTool(name: string): ComposedTool | undefined {
    const tool = this.toolRegistry.get(name);
    if (!tool) {
      return undefined;
    }
    return {
      name,
      description: tool.description,
      inputSchema:
        (tool.inputSchema ?? { type: "object", properties: {} }) as Tool[
          "inputSchema"
        ],
      ...(tool.outputSchema
        ? { outputSchema: tool.outputSchema as Tool["outputSchema"] }
        : {}),
      execute: tool.callback,
    };
  }

  /**
   * Get all tools as ComposedTool objects with execute callback
   * Includes both public and internal tools
   */
  getAllComposedTools(): ComposedTool[] {
    const composedTools: ComposedTool[] = [];

    for (const [name, tool] of this.toolRegistry.entries()) {
      composedTools.push({
        name,
        description: tool.description,
        inputSchema:
          (tool.inputSchema ?? { type: "object", properties: {} }) as Tool[
            "inputSchema"
          ],
        ...(tool.outputSchema
          ? { outputSchema: tool.outputSchema as Tool["outputSchema"] }
          : {}),
        execute: tool.callback,
      });
    }

    return composedTools;
  }
}
