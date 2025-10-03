import {
  CallToolRequestSchema,
  type CallToolResult,
  type Implementation,
  ListToolsRequestSchema,
  SetLevelRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { jsonSchema, type Schema } from "ai";
import type { McpSettingsSchema } from "./service/tools.ts";
import {
  Server,
  type ServerOptions,
} from "@modelcontextprotocol/sdk/server/index.js";
import type z from "zod";
import { parseTags } from "@mcpc/utils";
import { composeMcpDepTools } from "./utils/common/mcp.ts";
import type { ComposeDefinition } from "./set-up-mcp-compose.ts";
import { updateRefPaths } from "./utils/common/schema.ts";
import type { JSONSchema, ToolCallback } from "./types.ts";
import { registerAgenticTool } from "./executors/agentic/agentic-tool-registrar.ts";
import { registerAgenticWorkflowTool } from "./executors/workflow/workflow-tool-registrar.ts";
import { processToolTags } from "./utils/common/tool-tag-processor.ts";
import { getBuiltInPlugins } from "./plugins/built-in/index.ts";
import { createLogger } from "./utils/logger.ts";

// Import plugin types and utilities
import type {
  ComposedTool,
  ComposeEndContext,
  ToolConfig,
  ToolPlugin,
} from "./plugin-types.ts";
import { loadPlugin, shouldApplyPlugin } from "./plugin-utils.ts";

const ALL_TOOLS_PLACEHOLDER = "__ALL__";

export class ComposableMCPServer extends Server {
  private tools: Tool[] = [];
  private toolRegistry: Map<
    string,
    {
      callback: ToolCallback;
      description: string;
      schema?: JSONSchema;
    }
  > = new Map();
  private toolConfigs: Map<string, ToolConfig> = new Map();
  private globalPlugins: ToolPlugin[] = [];
  toolNameMapping: Map<string, string> = new Map();
  private logger = createLogger("mcpc.compose");

  constructor(_serverInfo: Implementation, options: ServerOptions) {
    // Automatically add common capabilities
    const enhancedOptions = {
      ...options,
      capabilities: {
        logging: {},
        tools: {},
        sampling: {},
        ...options.capabilities,
      },
    };
    super(_serverInfo, enhancedOptions);
    this.logger.setServer(this);
  }

  /**
   * Initialize built-in plugins - called during setup
   */
  async initBuiltInPlugins(): Promise<void> {
    // Auto-load built-in plugins
    const builtInPlugins = getBuiltInPlugins();
    for (const plugin of builtInPlugins) {
      await this.addPlugin(plugin);
    }
  }

  /**
   * Apply plugin transformations to tool arguments/results
   * TODO: Implement transformResult lifecycle hooks
   */
  private applyPluginTransforms(
    _toolName: string,
    args: unknown,
    _mode: "input" | "output",
    _originalArgs?: unknown,
  ): unknown {
    // For now, just return args unchanged
    // TODO: Implement transformResult hooks for runtime transformation
    return args;
  }

  /**
   * Resolve a tool name to its internal format
   */
  private resolveToolName(name: string): string | undefined {
    // Try exact match in runtime registry first
    if (this.toolRegistry.has(name)) {
      return name;
    }

    // Try mapping lookup (dot <-> underscore, or other mappings established by plugins)
    const mappedName = this.toolNameMapping.get(name);
    if (mappedName && this.toolRegistry.has(mappedName)) {
      return mappedName;
    }

    // As a fallback, check if name corresponds to a configured alias (visibility overrides),
    // then see if a mapping exists from that to a real tool in the registry
    if (this.toolConfigs.has(name)) {
      const cfgMapped = this.toolNameMapping.get(name);
      if (cfgMapped && this.toolRegistry.has(cfgMapped)) {
        return cfgMapped;
      }
    }

    return undefined;
  }

  tool<T>(
    name: string,
    description: string,
    paramsSchema: Schema<T>,
    cb: (args: T, extra?: unknown) => unknown,
    options: { internal?: boolean; plugins?: ToolPlugin[] } = {},
  ) {
    this.toolRegistry.set(name, {
      callback: cb as ToolCallback,
      description,
      schema: paramsSchema.jsonSchema as JSONSchema,
    });

    // Add any plugins specified for this tool to global plugins
    if (options.plugins) {
      for (const plugin of options.plugins) {
        this.globalPlugins.push(plugin);
      }
    }

    if (options.internal) {
      this.toolConfigs.set(name, { visibility: { internal: true } });
    } else {
      const existingTool = this.tools.find((t) => t.name === name);
      if (!existingTool) {
        const newTool: Tool = {
          name,
          description,
          inputSchema: paramsSchema.jsonSchema as Tool["inputSchema"],
        };
        this.tools = [...this.tools, newTool];
      }
    }

    this.setRequestHandler(ListToolsRequestSchema, () => {
      return { tools: this.tools };
    });

    this.setRequestHandler(CallToolRequestSchema, (request, extra) => {
      const { name: toolName, arguments: args } = request.params;

      // Get handler (try to find custom plugin handler or regular tool callback)
      const handler = this.getToolCallback(toolName);
      if (!handler) {
        throw new Error(`Tool ${toolName} not found`);
      }

      // Apply plugin transformations
      const processedArgs = this.applyPluginTransforms(toolName, args, "input");
      const result = handler(processedArgs, extra) as CallToolResult;

      return this.applyPluginTransforms(
        toolName,
        result,
        "output",
        args,
      ) as CallToolResult;
    });

    // Handle logging/setLevel requests from MCP clients
    this.setRequestHandler(SetLevelRequestSchema, (request) => {
      const { level } = request.params;
      this.logger.setLevel(level);
      return {};
    });
  }

  /**
   * Register a tool override with description, hide, args transformation, and/or custom handler
   */
  /**
   * Get tool callback from registry
   */
  getToolCallback(name: string): ToolCallback | undefined {
    return this.toolRegistry.get(name)?.callback;
  }

  /**
   * Find tool configuration (simplified - dot/underscore mapping now handled by plugin)
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
   * Call any registered tool directly, whether it's public or internal
   */
  async callTool(name: string, args: unknown): Promise<unknown> {
    const resolvedName = this.resolveToolName(name);
    if (!resolvedName) {
      throw new Error(`Tool ${name} not found`);
    }

    const callback = this.getToolCallback(resolvedName);
    if (!callback) {
      throw new Error(`Tool ${name} not found`);
    }

    const processedArgs = this.applyPluginTransforms(
      resolvedName,
      args,
      "input",
    );
    const result = await callback(processedArgs);
    return this.applyPluginTransforms(resolvedName, result, "output", args);
  }

  /**
   * Get all internal tool names
   */
  getInternalToolNames(): string[] {
    return Array.from(this.toolConfigs.entries())
      .filter(([_name, config]) => config.visibility?.internal)
      .map(([name]) => this.resolveToolName(name) ?? name);
  }

  /**
   * Get all public tool names
   */
  getPublicToolNames(): string[] {
    return Array.from(this.toolConfigs.entries())
      .filter(([_name, config]) => config.visibility?.global)
      .map(([name]) => this.resolveToolName(name) ?? name);
  }

  /**
   * Get all external (non-global, non-internal, non-hidden) tool names
   */
  getExternalToolNames(): string[] {
    const allRegistered = Array.from(this.toolRegistry.keys());
    const publicSet = new Set(this.getPublicToolNames());
    const internalSet = new Set(this.getInternalToolNames());
    const hiddenSet = new Set(this.getHiddenToolNames());

    return allRegistered.filter(
      (n) => !publicSet.has(n) && !internalSet.has(n) && !hiddenSet.has(n),
    );
  }

  /**
   * Get all hidden tool names
   */
  getHiddenToolNames(): string[] {
    return Array.from(this.toolConfigs.entries())
      .filter(([_name, config]) => config.visibility?.hide)
      .map(([name]) => this.resolveToolName(name) ?? name);
  }

  /**
   * Get internal tool schema by name
   */
  getInternalToolSchema(
    name: string,
  ): { description: string; schema: JSONSchema } | undefined {
    const tool = this.toolRegistry.get(name);
    const config = this.toolConfigs.get(name);
    if (tool && config?.visibility?.internal && tool.schema) {
      return {
        description: tool.description,
        schema: tool.schema,
      };
    }
    return undefined;
  }

  /**
   * Check if a tool exists (visible or internal)
   */
  hasToolNamed(name: string): boolean {
    return (
      this.toolRegistry.has(name) ||
      (this.toolNameMapping.has(name) &&
        this.toolRegistry.has(this.toolNameMapping.get(name)!))
    );
  }

  /**
   * Configure tool behavior (simplified replacement for middleware)
   * @example
   * ```typescript
   * // Override description
   * server.configTool('myTool', {
   *   callback: originalCallback,
   *   description: 'Enhanced tool description'
   * });
   *
   * // Hide tool from agentic execution
   * server.configTool('myTool', {
   *   callback: originalCallback,
   *   description: 'Hidden tool',
   *   visibility: { hide: true }
   * });
   *
   * // Make tool globally available
   * server.configTool('myTool', {
   *   callback: originalCallback,
   *   description: 'Global tool',
   *   visibility: { global: true }
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
   * // Global plugin for all tools
   * server.addPlugin({
   *   name: 'logger',
   *   transformTool: (tool, context) => {
   *     const originalExecute = tool.execute;
   *     tool.execute = async (args, extra) => {
   *       console.log(`Calling ${tool.name} with:`, args);
   *       const result = await originalExecute(args, extra);
   *       console.log(`Result:`, result);
   *       return result;
   *     };
   *     return tool;
   *   }
   * });
   * ```
   */
  async addPlugin(plugin: ToolPlugin): Promise<void> {
    // Call configureServer hook immediately when plugin is added
    if (plugin.configureServer) {
      await plugin.configureServer(this);
    }

    this.globalPlugins.push(plugin);
  }

  /**
   * Load and register a plugin from a file path with optional parameters
   *
   * Supports parameter passing via query string syntax:
   * loadPluginFromPath("path/to/plugin.ts?param1=value1&param2=value2")
   */
  async loadPluginFromPath(pluginPath: string): Promise<void> {
    const plugin = await loadPlugin(pluginPath);
    this.addPlugin(plugin);
  }

  /**
   * Apply transformTool hook to a tool during composition
   */
  private async applyTransformToolHooks(
    tool: ComposedTool,
    toolName: string,
    mode: "agentic" | "agentic_workflow",
  ): Promise<ComposedTool> {
    const transformPlugins = this.globalPlugins.filter(
      (p) => p.transformTool && shouldApplyPlugin(p, mode),
    );

    if (transformPlugins.length === 0) {
      return tool;
    }

    const sortedPlugins = [
      ...transformPlugins.filter((p) => p.enforce === "pre"),
      ...transformPlugins.filter((p) => !p.enforce),
      ...transformPlugins.filter((p) => p.enforce === "post"),
    ];

    const context: any = {
      toolName,
      server: this,
      mode,
    };

    let currentTool = tool;
    for (const plugin of sortedPlugins) {
      if (plugin.transformTool) {
        const result = await plugin.transformTool(currentTool, context);
        if (result) {
          currentTool = result;
        }
      }
    }

    return currentTool;
  }

  /**
   * Apply plugins to all tools in registry and handle visibility configurations
   */
  private async processToolsWithPlugins(
    externalTools: Record<string, ComposedTool>,
    mode: "agentic" | "agentic_workflow",
  ): Promise<void> {
    for (const [toolId, toolData] of this.toolRegistry.entries()) {
      const defaultSchema = {
        type: "object",
        properties: {},
        additionalProperties: true,
      } as Tool["inputSchema"];
      const tempTool: ComposedTool = {
        name: toolId,
        description: toolData.description,
        inputSchema: (toolData.schema as Tool["inputSchema"]) || defaultSchema,
        execute: toolData.callback,
      };

      const processedTool = await this.applyTransformToolHooks(
        tempTool,
        toolId,
        mode,
      );

      this.toolRegistry.set(toolId, {
        callback: processedTool.execute,
        description: processedTool.description || toolData.description,
        schema: processedTool.inputSchema as JSONSchema,
      });

      if (externalTools[toolId]) {
        // If a visibility processor is provided by built-in plugins, try to call it.
        try {
          // dynamic import to avoid coupling if symbol not exported
          // use `any` to safely access optional export without a type error
          const builtIn: any = await import("./plugins/built-in/index.ts");
          if (builtIn && typeof builtIn.processToolVisibility === "function") {
            builtIn.processToolVisibility(
              toolId,
              processedTool,
              this,
              externalTools,
            );
          }
        } catch {
          // ignore if not present
        }

        externalTools[toolId] = processedTool;
      }
    }
  }

  /**
   * Trigger composeEnd hooks for all plugins
   */
  private async triggerComposeEndHooks(
    context: ComposeEndContext,
  ): Promise<void> {
    const endPlugins = this.globalPlugins.filter(
      (p) => p.composeEnd && shouldApplyPlugin(p, context.mode),
    );

    for (const plugin of endPlugins) {
      if (plugin.composeEnd) {
        await plugin.composeEnd(context);
      }
    }
  }

  async compose(
    name: string | null,
    description: string,
    depsConfig: z.infer<typeof McpSettingsSchema> = { mcpServers: {} },
    options: ComposeDefinition["options"] = { mode: "agentic" },
  ) {
    const refDesc = options.refs?.join("") ?? "";
    const { tagToResults } = parseTags(description + refDesc, ["tool", "fn"]);

    tagToResults.tool.forEach((toolEl: any) => {
      const toolName = toolEl.attribs.name;
      const toolDescription = toolEl.attribs.description;
      const isHidden = toolEl.attribs.hide !== undefined;
      const isGlobal = toolEl.attribs.global !== undefined;

      if (toolName) {
        this.toolConfigs.set(toolName, {
          description: toolDescription,
          visibility: {
            hide: isHidden,
            global: isGlobal,
          },
        });
      }
    });

    // Filter tools and transform scoped tool names to valid action identifiers
    const toolNameToIdMapping = new Map<string, string>();
    const requestedToolNames = new Set<string>();
    const availableToolNames = new Set<string>();

    // Collect all requested tool names from XML tags
    tagToResults.tool.forEach((tool: any) => {
      if (tool.attribs.name) {
        requestedToolNames.add(tool.attribs.name);
      }
    });

    const { tools, cleanupClients } = (await composeMcpDepTools(
      depsConfig,
      ({ mcpName, toolNameWithScope, toolId }: any) => {
        toolNameToIdMapping.set(toolNameWithScope, toolId);

        // Track all available tool names for warning purposes
        availableToolNames.add(toolNameWithScope);
        availableToolNames.add(toolId);
        availableToolNames.add(`${mcpName}.${ALL_TOOLS_PLACEHOLDER}`);
        availableToolNames.add(mcpName);

        // Populate server-level name mappings for easier resolution at runtime
        // 1) Map fully-scoped name (e.g., "server.SearchLog") -> toolId
        this.toolNameMapping.set(toolNameWithScope, toolId);

        // 2) Map bare internal tool name when unambiguous
        //    Extract internal part after the first dot if present
        const internalName = toolNameWithScope.includes(".")
          ? toolNameWithScope.split(".").slice(1).join(".")
          : toolNameWithScope;
        if (!this.toolNameMapping.has(internalName)) {
          this.toolNameMapping.set(internalName, toolId);
        }

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

        return tagToResults.tool.find((tool: any) => {
          const selectAll =
            tool.attribs.name === `${mcpName}.${ALL_TOOLS_PLACEHOLDER}` ||
            tool.attribs.name === `${mcpName}`;

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

    // Warn about unmatched tool names and show available options
    const unmatchedTools = Array.from(requestedToolNames).filter(
      (toolName) => !availableToolNames.has(toolName),
    );

    if (unmatchedTools.length > 0) {
      await this.logger.warning(`Tool matching warnings for agent "${name}":`);
      for (const toolName of unmatchedTools) {
        await this.logger.warning(`   • Tool not found: "${toolName}"`);
      }
      await this.logger.warning(
        `   Available tools: ${
          Array.from(availableToolNames).sort().join(", ")
        }`,
      );
    }

    // Add external tools to registry
    Object.entries(tools).forEach(([toolId, tool]) => {
      this.toolRegistry.set(toolId, {
        callback: tool.execute,
        description: tool.description || "No description available",
        schema: tool.inputSchema as JSONSchema,
      });
    });

    // Trigger transformation hooks for all tools
    await this.processToolsWithPlugins(tools, options.mode ?? "agentic");

    // Cleanup clients when server is closed (pretty-printed to match logging plugin)
    this.onclose = async () => {
      await cleanupClients();
      await this.logger.info(
        `[${name}] Event: closed - cleaned up dependent clients`,
      );
    };

    this.onerror = async (error) => {
      await this.logger.error(
        `[${name}] Event: error - ${error?.stack ?? String(error)}`,
      );
      await cleanupClients();
      await this.logger.info(`[${name}] Action: cleaned up dependent clients`);
    };

    const toolNameToDetailList = Object.entries(tools);

    // Tools will be seen by LLM in tools config
    const globalToolNames = this.getPublicToolNames();

    const hideToolNames = this.getHiddenToolNames();
    const internalToolNames = this.getInternalToolNames();

    // Tools will be seen by LLM in agentic tool definition
    const contextToolNames = toolNameToDetailList
      .map(([name]) => name)
      .filter(
        (n) => !globalToolNames.includes(n) && !hideToolNames.includes(n),
      );

    // For agentic interface: external tools (non-hidden) + internal tools
    const allToolNames = [...contextToolNames, ...internalToolNames];

    // Add global tools to server
    globalToolNames.forEach((toolId) => {
      const tool = tools[toolId];
      if (!tool) {
        throw new Error(
          `Global tool ${toolId} not found in registry, available: ${
            Object.keys(
              tools,
            ).join(", ")
          }`,
        );
      }
      this.tool(
        toolId,
        tool.description || "No description available",
        jsonSchema(tool.inputSchema as any),
        tool.execute,
      );
    });

    // Trigger composition complete hooks
    await this.triggerComposeEndHooks({
      toolName: name,
      pluginNames: this.globalPlugins.map((p) => p.name),
      mode: options.mode ?? "agentic",
      server: this,
    });

    // If no description is provided, compose references only, no tool registration
    if (!name) {
      return;
    }

    const desTags = parseTags(description, ["tool", "fn"]);
    // Replace tool tags with action tags after tool filtering is complete
    description = processToolTags({
      ...desTags,
      description: description,
      tools,
      toolOverrides: this.toolConfigs,
      toolNameMapping: toolNameToIdMapping,
    });

    const depGroups: Record<string, unknown> = {};
    toolNameToDetailList.forEach(([toolName, tool]) => {
      if (
        hideToolNames.includes(this.resolveToolName(toolName) ?? "") ||
        globalToolNames.includes(this.resolveToolName(toolName) ?? "")
      ) {
        // If the tool is hidden/global, we can skip it
        return;
      }
      if (!tool) {
        throw new Error(
          `Action ${toolName} not found, available action list: ${
            allToolNames.join(
              ", ",
            )
          }`,
        );
      }

      const baseSchema =
        // Compatiable with ComposiableleMCPServer.tool() definition
        (tool.inputSchema.jsonSchema as JSONSchema) ??
          // Standard definition
          tool.inputSchema ?? {
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
