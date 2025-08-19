import {
  CallToolRequestSchema,
  type CallToolResult,
  type Implementation,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import type { Schema } from "ai";
import type { McpSettingsSchema } from "./service/tools.ts";
import {
  Server,
  type ServerOptions,
} from "@modelcontextprotocol/sdk/server/index.js";
import type z from "zod";
import { composeMcpDepTools, parseTags } from "../mod.ts";
import type { ComposeDefinition } from "./set-up-mcp-compose.ts";
import { updateRefPaths } from "./utils/common/schema.ts";
import type { JSONSchema, ToolCallback } from "./types.ts";
import { registerAgenticTool } from "./executors/agentic/agentic-tool-registrar.ts";
import { registerAgenticWorkflowTool } from "./executors/workflow/workflow-tool-registrar.ts";
import { processToolTags } from "./utils/common/tool-tag-processor.ts";

interface ComposedTool extends Tool {
  execute: ToolCallback;
}

const ALL_TOOLS_PLACEHOLDER = "__ALL__";

/**
 * Simple and unified tool extension system
 */
export interface ToolPlugin {
  /** Plugin name for identification */
  name: string;
  /** Transform tool behavior */
  transform: (
    tool: ComposedTool,
    context: PluginContext,
  ) => ComposedTool | void;
  /** When to apply this plugin - 'compose' (during composition) or 'runtime' (during execution) */
  when?: "compose" | "runtime";
  /** Plugin execution order - 'pre' (before core), 'post' (after core), or default */
  enforce?: "pre" | "post";
}

export type PluginOption =
  | ToolPlugin
  | ToolPlugin[]
  | (() => ToolPlugin | ToolPlugin[] | null | undefined)
  | null
  | undefined
  | false;

export interface PluginContext {
  /** Tool name */
  toolName: string;
  /** Server instance for accessing other tools */
  server: ComposableMCPServer;
  /** Current execution mode */
  mode: "compose" | "runtime";
}

/** Simple tool configuration options */
export interface ToolConfig {
  /** Override the tool's description */
  description?: string;
  /** Hide the tool from composed tools context */
  hide?: boolean;
  /** Register the tool as a global tool in the server's public tool list */
  global?: boolean;
}

export class ComposableMCPServer extends Server {
  private tools: Tool[] = [];
  private nameToCb: Map<string, ToolCallback> = new Map();
  private internalTools: Map<
    string,
    { callback: ToolCallback; description: string; schema: JSONSchema }
  > = new Map();
  private hiddenTools: Map<string, ToolCallback> = new Map();
  private composedTools: Map<string, ToolCallback> = new Map();
  private toolConfigs: Map<string, ToolConfig> = new Map();
  private toolPlugins: ToolPlugin[] = [];
  private toolNameMapping: Map<string, string> = new Map();

  constructor(_serverInfo: Implementation, options: ServerOptions) {
    super(_serverInfo, options);
  }

  /**
   * Apply plugin transformations to tool arguments/results
   */
  private applyPluginTransforms(
    toolName: string,
    args: unknown,
    mode: "input" | "output",
    _originalArgs?: unknown
  ): unknown {
    const plugins = this.toolPlugins.filter(p => p.when === "runtime" || !p.when);
    
    return plugins.reduce((currentArgs, plugin) => {
      // Create temporary tool for transformation
      const tempTool: ComposedTool = {
        name: toolName,
        description: `Plugin transform for ${toolName}`,
        inputSchema: { type: "object", properties: {}, additionalProperties: true },
        execute: mode === "input" 
          ? (args) => ({ content: [{ type: "text", text: String(args) }] })
          : (args) => ({ content: [{ type: "text", text: String(args) }] })
      };

      const context: PluginContext = {
        toolName,
        server: this,
        mode: "runtime",
      };

      const result = plugin.transform(tempTool, context);
      
      // Extract transformed arguments/results if plugin modified them
      if (result?.execute) {
        try {
          const transformed = result.execute(currentArgs);
          return mode === "output" ? transformed : currentArgs;
        } catch {
          return currentArgs;
        }
      }
      
      return currentArgs;
    }, args);
  }

  /**
   * Check if a tool exists in any storage
   */
  private hasToolInStorage(name: string): boolean {
    return this.nameToCb.has(name) ||
      this.internalTools.has(name) ||
      this.hiddenTools.has(name) ||
      this.composedTools.has(name);
  }

  /**
   * Resolve a tool name to its internal format
   */
  private resolveToolName(name: string): string | undefined {
    // Try exact match first
    if (this.hasToolInStorage(name)) {
      return name;
    }

    // Try mapping lookup
    const mappedName = this.toolNameMapping.get(name);
    if (mappedName && this.hasToolInStorage(mappedName)) {
      return mappedName;
    }

    return undefined;
  }

  tool<T>(
    name: string,
    description: string,
    paramsSchema: Schema<T>,
    cb: (args: T, extra?: unknown) => unknown,
    internal: boolean = false,
  ) {
    if (!internal) {
      const newTool: Tool = {
        name,
        description,
        inputSchema: paramsSchema.jsonSchema as Tool["inputSchema"],
      };

      this.tools = [...this.tools, newTool];
      this.nameToCb.set(name, cb as ToolCallback);
    } else {
      // Register as internal tool - not visible in public list
      this.internalTools.set(name, {
        callback: cb as ToolCallback,
        description,
        schema: paramsSchema.jsonSchema as JSONSchema,
      });
    }

    this.setRequestHandler(ListToolsRequestSchema, () => {
      return { tools: this.tools };
    });

    this.setRequestHandler(CallToolRequestSchema, (request, extra) => {
      const { name: toolName, arguments: args } = request.params;

      // Get handler (try to find custom plugin handler or regular tool callback)
      let handler = this.getToolCallback(toolName);
      if (!handler) {
        throw new Error(`Tool ${toolName} not found`);
      }

      // Apply runtime plugins
      handler = this.applyRuntimePlugins(handler, toolName);

      // Apply plugin transformations
      const processedArgs = this.applyPluginTransforms(toolName, args, "input");
      const result = handler(processedArgs, extra) as CallToolResult;
      
      return this.applyPluginTransforms(toolName, result, "output", args) as CallToolResult;
    });
  }

  /**
   * Register a tool override with description, hide, args transformation, and/or custom handler
   */
  /**
   * Get tool callback from any storage
   */
  private getToolCallback(name: string): ToolCallback | undefined {
    return this.nameToCb.get(name) ||
      this.internalTools.get(name)?.callback ||
      this.hiddenTools.get(name) ||
      this.composedTools.get(name);
  }

  /**
   * Find tool configuration, supporting both dot and underscore notation
   */
  private findToolConfig(toolId: string): ToolConfig | undefined {
    // Try direct match first
    const directConfig = this.toolConfigs.get(toolId);
    if (directConfig) {
      return directConfig;
    }

    // Check dot/underscore notation mapping
    const dotNotationId = toolId.replace(/_/g, ".");
    for (const [configName, configOptions] of this.toolConfigs.entries()) {
      const underscoreNotationId = configName.replace(/\./g, "_");

      if (configName === dotNotationId || underscoreNotationId === toolId) {
        // Store bidirectional mapping for future lookups
        this.toolNameMapping.set(dotNotationId, toolId);
        this.toolNameMapping.set(toolId, dotNotationId);
        return configOptions;
      }
    }

    return undefined;
  }

  /**
   * Call any registered tool directly, whether it's public or internal
   */
  async callTool(name: string, args: unknown): Promise<unknown> {
    const resolvedName = this.resolveToolName(name);
    if (!resolvedName) {
      throw new Error(`Tool ${name} not found`);
    }

    let callback = this.getToolCallback(resolvedName);
    if (!callback) {
      throw new Error(`Tool ${name} not found`);
    }

    // Apply runtime plugins before execution
    callback = this.applyRuntimePlugins(callback, resolvedName);

    // Apply plugin transformations
    const processedArgs = this.applyPluginTransforms(resolvedName, args, "input");
    const result = await callback(processedArgs);
    return this.applyPluginTransforms(resolvedName, result, "output", args);
  }

  /**
   * Get all available tool names (including internal tools)
   */
  getAllToolNames(): string[] {
    return [
      ...Array.from(this.nameToCb.keys()),
      ...Array.from(this.internalTools.keys()),
      ...Array.from(this.hiddenTools.keys()),
      ...Array.from(this.composedTools.keys()),
    ];
  }

  /**
   * Get all internal tool names
   */
  getInternalToolNames(): string[] {
    return Array.from(this.internalTools.keys());
  }

  /**
   * Get internal tool schema by name
   */
  getInternalToolSchema(
    name: string,
  ): { description: string; schema: JSONSchema } | undefined {
    const internalTool = this.internalTools.get(name);
    if (internalTool) {
      return {
        description: internalTool.description,
        schema: internalTool.schema,
      };
    }
    return undefined;
  }

  /**
   * Check if a tool exists (visible or internal)
   */
  hasToolNamed(name: string): boolean {
    return (
      this.nameToCb.has(name) ||
      this.internalTools.has(name) ||
      this.hiddenTools.has(name)
    );
  }

  /**
   * Configure tool behavior (simplified replacement for middleware)
   * @example
   * ```typescript
   * // Override description
   * server.configTool('myTool', {
   *   description: 'Enhanced tool description'
   * });
   *
   * // Hide tool from agentic execution
   * server.configTool('myTool', {
   *   hide: true
   * });
   *
   * // Make tool globally available
   * server.configTool('myTool', {
   *   global: true
   * });
   * ```
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
   * Remove tool configuration
   */
  removeToolConfig(toolName: string): boolean {
    return this.toolConfigs.delete(toolName);
  }

  /**
   * Register a tool plugin
   * @example
   * ```typescript
   * // Simple logging plugin
   * server.addPlugin({
   *   name: 'logger',
   *   apply: (tool) => {
   *     const originalExecute = tool.execute;
   *     tool.execute = async (args, extra) => {
   *       console.log(`Calling ${tool.name} with:`, args);
   *       const result = await originalExecute(args, extra);
   *       console.log(`Result:`, result);
   *       return result;
   *     };
   *   }
   * });
   * ```
   */
  addPlugin(plugin: ToolPlugin): void {
    this.toolPlugins.push(plugin);
  }

  /**
   * Load plugin from file path
   * @example
   * ```typescript
   * // Load plugin from file
   * await server.loadPlugin('./my-plugin.js');
   * ```
   */
  async loadPlugin(pluginPath: string): Promise<void> {
    try {
      const pluginModule = await import(pluginPath);
      const plugin = pluginModule.default || pluginModule;

      if (plugin && typeof plugin.apply === "function") {
        this.addPlugin(plugin);
      } else {
        throw new Error(`Invalid plugin format in ${pluginPath}`);
      }
    } catch (error) {
      throw new Error(`Failed to load plugin from ${pluginPath}: ${error}`);
    }
  }

  /**
   * Apply compose-time plugins to a tool
   */
  private applyComposePlugins(
    tool: ComposedTool,
    toolName: string,
  ): ComposedTool {
    const composePlugins = this.toolPlugins.filter(
      (p) => p.when === "compose" || !p.when,
    );

    if (composePlugins.length === 0) {
      return tool;
    }

    // Sort plugins by enforcement order
    const sortedPlugins = [
      ...composePlugins.filter((p) => p.enforce === "pre"),
      ...composePlugins.filter((p) => !p.enforce),
      ...composePlugins.filter((p) => p.enforce === "post"),
    ];

    const context: PluginContext = {
      toolName,
      server: this,
      mode: "compose",
    };

    return sortedPlugins.reduce((currentTool, plugin) => {
      const result = plugin.transform(currentTool, context);
      return result || currentTool;
    }, tool);
  }

  /**
   * Apply runtime plugins to a tool callback during execution
   */
  private applyRuntimePlugins(
    callback: ToolCallback,
    toolName: string,
  ): ToolCallback {
    const runtimePlugins = this.toolPlugins.filter(
      (p) => p.when === "runtime" || !p.when,
    );

    if (runtimePlugins.length === 0) {
      return callback;
    }

    // Sort plugins by enforcement order
    const sortedPlugins = [
      ...runtimePlugins.filter((p) => p.enforce === "pre"),
      ...runtimePlugins.filter((p) => !p.enforce),
      ...runtimePlugins.filter((p) => p.enforce === "post"),
    ];

    return sortedPlugins.reduce((currentCallback, plugin) => {
      const tempTool: ComposedTool = {
        name: toolName,
        description: `Runtime execution of ${toolName}`,
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
        },
        execute: currentCallback,
      };

      const context: PluginContext = {
        toolName,
        server: this,
        mode: "runtime",
      };

      const result = plugin.transform(tempTool, context);
      return result?.execute || currentCallback;
    }, callback);
  }

  async compose(
    name: string,
    description: string,
    depsConfig: z.infer<typeof McpSettingsSchema> = { mcpServers: {} },
    options: ComposeDefinition["options"] = { mode: "agentic" },
  ) {
    const { tagToResults, $ } = parseTags(description, ["tool", "fn"]);

    // Process tool middleware/overrides from description
    tagToResults.tool.forEach((toolEl) => {
      const toolName = toolEl.attribs.name;
      const toolDescription = toolEl.attribs.description;
      const isHidden = toolEl.attribs.hide !== undefined;
      const isGlobal = toolEl.attribs.global !== undefined;

      if (toolName && (toolDescription || isHidden || isGlobal)) {
        this.toolConfigs.set(toolName, {
          description: toolDescription,
          hide: isHidden,
          global: isGlobal,
        });
      }
    });

    // Filter tools and transform scoped tool names to valid action identifiers
    const toolNameToIdMapping = new Map<string, string>();
    const { tools, cleanupClients } = (await composeMcpDepTools(
      depsConfig,
      ({ mcpName, toolNameWithScope, toolId }) => {
        // Store the mapping for later use in tag processing
        toolNameToIdMapping.set(toolNameWithScope, toolId);

        const matchingStep = options.steps?.find((step) =>
          step.actions.includes(toolNameWithScope)
        );

        if (matchingStep) {
          const actionIndex = matchingStep.actions.indexOf(toolNameWithScope);
          if (actionIndex !== -1) {
            matchingStep.actions[actionIndex] = toolId;
          }
          return true;
        }

        return tagToResults.tool.find((tool) => {
          const selectAll =
            tool.attribs.name === `${mcpName}.${ALL_TOOLS_PLACEHOLDER}`;

          if (selectAll) {
            return true;
          }
          return (
            tool.attribs.name === toolNameWithScope ||
            tool.attribs.name === toolId
          );
        });
      },
    )) as {
      tools: Record<string, ComposedTool>;
      cleanupClients: () => Promise<void>;
    };

    // Replace tool tags with action tags after tool filtering is complete
    description = processToolTags({
      description,
      tagToResults,
      $,
      tools,
      toolOverrides: this.toolConfigs,
      toolNameMapping: toolNameToIdMapping,
    });

    // Cleanup clients when server is closed
    this.onclose = async () => {
      await cleanupClients();
      console.log(`[${name}] MCP server closed, cleaned up dependent clients.`);
    };
    this.onerror = async (error) => {
      console.error(`[${name}] MCP server error:`, error);
      await cleanupClients();
      console.log(
        `[${name}] MCP server error handled, cleaned up dependent clients.`,
      );
    };

    // Apply tool middleware/overrides and plugins
    Object.entries(tools).forEach(([toolId, tool]) => {
      // Apply plugins first
      const processedTool = this.applyComposePlugins(tool, toolId);

      // Then apply configuration
      const config = this.findToolConfig(toolId);

      if (config) {
        if (config.description) {
          processedTool.description = config.description;
        }

        // Handle hide/global options
        if (config.hide) {
          // Hide from composed tools context
          this.hiddenTools.set(toolId, processedTool.execute);
          delete tools[toolId];
          return; // Skip further processing for hidden tools
        } else if (config.global) {
          // Register as a global tool in the server's public tool list
          const globalTool: Tool = {
            name: toolId,
            description: processedTool.description,
            inputSchema: processedTool.inputSchema as Tool["inputSchema"],
          };
          this.tools = [...this.tools, globalTool];
          this.nameToCb.set(toolId, processedTool.execute);
        }
      }

      // Update the tool in the tools object
      tools[toolId] = processedTool;
    });

    // Store composed tools for callTool access
    Object.entries(tools).forEach(([toolId, tool]) => {
      this.composedTools.set(toolId, tool.execute);
    });

    const toolNameToDetailList = Object.entries(tools);
    const externalToolNames = toolNameToDetailList.map(([name]) => name);
    const internalToolNames = this.getInternalToolNames();

    // For agentic interface: external tools (non-hidden) + internal tools
    const allToolNames = [...externalToolNames, ...internalToolNames];
    console.log(
      `[${name}][composed tools] external: ${
        externalToolNames.join(
          ", ",
        )
      } | internal: ${internalToolNames.join(", ")}`,
    );

    const depGroups: Record<string, unknown> = {};
    toolNameToDetailList.forEach(([toolName, tool]) => {
      if (!tool) {
        throw new Error(
          `Action ${toolName} not found, available action list: ${
            allToolNames.join(
              ", ",
            )
          }`,
        );
      }

      const baseSchema = tool.inputSchema || {
        type: "object",
        properties: {},
        required: [],
      };

      const baseProperties =
        baseSchema.type === "object" && baseSchema.properties
          ? baseSchema.properties
          : {};
      const baseRequired =
        baseSchema.type === "object" && Array.isArray(baseSchema.required)
          ? baseSchema.required
          : [];

      const updatedProperties = updateRefPaths(baseProperties, toolName);

      depGroups[toolName] = {
        type: "object",
        description: tool.description,
        properties: updatedProperties,
        required: [...baseRequired],
        additionalProperties: false,
      };
    });

    // Add internal tools to depGroups
    internalToolNames.forEach((toolName) => {
      const toolSchema = this.getInternalToolSchema(toolName);
      if (toolSchema) {
        depGroups[toolName] = {
          ...toolSchema.schema,
          description: toolSchema.description,
        };
      } else {
        // Error if internal tool schema not found
        throw new Error(`Internal tool schema not found for: ${toolName}`);
      }
    });

    switch (options.mode ?? "agentic") {
      case "agentic":
        registerAgenticTool(this, {
          description,
          name,
          allToolNames,
          depGroups,
          toolNameToDetailList,
          sampling: options.sampling,
        });
        break;
      case "agentic_workflow":
        registerAgenticWorkflowTool(this, {
          description,
          name,
          allToolNames,
          depGroups,
          toolNameToDetailList,
          predefinedSteps: options.steps,
          sampling: options.sampling,
          ensureStepActions: options.ensureStepActions,
          toolNameToIdMapping,
        });
        break;
    }
  }
}
