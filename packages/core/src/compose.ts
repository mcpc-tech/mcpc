import {
  CallToolRequestSchema,
  type CallToolResult,
  type Implementation,
  ListToolsRequestSchema,
  SetLevelRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { extractJsonSchema, jsonSchema, type Schema } from "./utils/schema.ts";
import type { MCPSetting } from "./service/tools.ts";
import {
  Server,
  type ServerOptions,
} from "@modelcontextprotocol/sdk/server/index.js";
import { parseTags } from "@mcpc/utils";
import { composeMcpDepTools } from "./utils/common/mcp.ts";
import type { ComposeDefinition } from "./set-up-mcp-compose.ts";
import type { JSONSchema, ToolCallback } from "./types.ts";
import { processToolTags } from "./utils/common/tool-tag-processor.ts";
import { getBuiltInPlugins } from "./plugins/built-in/index.ts";
import { createLogger } from "./utils/logger.ts";

// Import plugin types and utilities
import type { ComposedTool, ToolConfig, ToolPlugin } from "./plugin-types.ts";
import type { ExecutionMode } from "./prompts/types.ts";
import { sortPluginsByOrder, validatePlugins } from "./plugin-utils.ts";

// Import new manager modules
import { PluginManager } from "./utils/plugin-manager.ts";
import { ToolManager } from "./utils/tool-manager.ts";
import {
  buildDependencyGroups,
  processToolsWithPlugins,
} from "./utils/compose-helpers.ts";
import { sanitizePropertyKey } from "./utils/common/provider.ts";

const ALL_TOOLS_PLACEHOLDER = "__ALL__";

export class ComposableMCPServer extends Server {
  private pluginManager: PluginManager;
  private toolManager: ToolManager;
  private logger = createLogger("mcpc.compose");

  // Legacy property for backward compatibility
  get toolNameMapping(): Map<string, string> {
    return this.toolManager.getToolNameMapping();
  }

  constructor(_serverInfo: Implementation, options: ServerOptions) {
    // Automatically add common capabilities
    const enhancedOptions = {
      ...options,
      capabilities: {
        logging: {},
        tools: {},

        ...(options?.capabilities ?? {}),
      },
    };
    super(_serverInfo, enhancedOptions);
    this.logger.setServer(this);
    this.pluginManager = new PluginManager(this);
    this.toolManager = new ToolManager();
  }

  /**
   * Initialize built-in plugins - called during setup
   */
  async initBuiltInPlugins(): Promise<void> {
    const builtInPlugins = getBuiltInPlugins();

    // Validate plugins before adding
    const validation = validatePlugins(builtInPlugins);
    if (!validation.valid) {
      await this.logger.warning("Built-in plugin validation issues:");
      for (const error of validation.errors) {
        await this.logger.warning(`  - ${error}`);
      }
    }

    for (const plugin of builtInPlugins) {
      await this.pluginManager.addPlugin(plugin);
    }
  }

  /**
   * Apply plugin transformations to tool arguments/results
   * Supports runtime transformation hooks for input/output processing
   */
  private async applyPluginTransforms(
    toolName: string,
    data: unknown,
    direction: "input" | "output",
    originalArgs?: unknown,
  ): Promise<unknown> {
    // Get applicable plugins based on direction
    const hookName = direction === "input"
      ? "transformInput"
      : "transformOutput";
    const plugins = this.pluginManager.getPlugins().filter((p) => p[hookName]);

    if (plugins.length === 0) {
      return data;
    }

    // Sort plugins to maintain consistent order
    const sortedPlugins = sortPluginsByOrder(plugins);

    let currentData = data;
    const context = {
      toolName,
      server: this,
      direction,
      originalArgs,
    };

    // Apply transformations sequentially
    for (const plugin of sortedPlugins) {
      const hook = plugin[hookName];
      if (hook) {
        try {
          const result = await hook(currentData, context);
          if (result !== undefined) {
            currentData = result;
          }
        } catch (error) {
          const errorMsg = error instanceof Error
            ? error.message
            : String(error);
          await this.logger.error(
            `Plugin "${plugin.name}" ${hookName} failed for "${toolName}": ${errorMsg}`,
          );
          // Continue with other plugins even if one fails
        }
      }
    }

    return currentData;
  }

  /**
   * Resolve a tool name to its internal format
   */
  private resolveToolName(name: string): string | undefined {
    return this.toolManager.resolveToolName(name);
  }

  tool<T>(
    name: string,
    description: string,
    paramsSchema: Schema<T> | JSONSchema,
    cb: (args: T, extra?: unknown) => unknown,
    options: { internal?: boolean; plugins?: ToolPlugin[] } = {},
  ) {
    // Extract JSON Schema from wrapped or unwrapped format
    const jsonSchemaObj = extractJsonSchema(paramsSchema as Schema<T>);

    this.toolManager.registerTool(
      name,
      description,
      jsonSchemaObj,
      cb as ToolCallback,
      options,
    );

    // Add to public tools if not internal (for tools registered via server.tool())
    // This makes tools registered in setup callbacks public by default
    if (!options.internal) {
      this.toolManager.addPublicTool(name, description, jsonSchemaObj);
    }

    // Add any plugins specified for this tool to plugin manager
    if (options.plugins) {
      for (const plugin of options.plugins) {
        this.pluginManager.addPlugin(plugin);
      }
    }

    this.setRequestHandler(ListToolsRequestSchema, () => {
      return { tools: this.toolManager.getPublicTools() };
    });

    this.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const { name: toolName, arguments: args } = request.params;

      // Get handler
      const handler = this.getToolCallback(toolName);
      if (!handler) {
        throw new Error(`Tool ${toolName} not found`);
      }

      // Apply plugin transformations
      const processedArgs = await this.applyPluginTransforms(
        toolName,
        args,
        "input",
      );
      const result = (await handler(processedArgs, extra)) as CallToolResult;

      return (await this.applyPluginTransforms(
        toolName,
        result,
        "output",
        args,
      )) as CallToolResult;
    });

    // Handle logging/setLevel requests from MCP clients
    this.setRequestHandler(SetLevelRequestSchema, (request) => {
      const { level } = request.params;
      this.logger.setLevel(level);
      return {};
    });
  }

  /**
   * Get tool callback from registry
   */
  getToolCallback(name: string): ToolCallback | undefined {
    return this.toolManager.getToolCallback(name);
  }

  /**
   * Find tool configuration
   */
  findToolConfig(toolId: string): ToolConfig | undefined {
    return this.toolManager.findToolConfig(toolId);
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

    const processedArgs = await this.applyPluginTransforms(
      resolvedName,
      args,
      "input",
    );
    const result = await callback(processedArgs);
    return await this.applyPluginTransforms(
      resolvedName,
      result,
      "output",
      args,
    );
  }

  /**
   * Get all public tool names (exposed to MCP clients)
   */
  getPublicToolNames(): string[] {
    return this.toolManager.getPublicToolNames();
  }

  /**
   * Get all public tools (for AI SDK integration)
   */
  getPublicTools(): Tool[] {
    return this.toolManager.getPublicTools();
  }

  /**
   * Get all hidden tool names
   */
  getHiddenToolNames(): string[] {
    return this.toolManager.getHiddenToolNames();
  }

  /**
   * Get all internal tool names (tools that are not public)
   */
  getInternalToolNames(): string[] {
    const allToolNames = Array.from(this.toolManager.getToolRegistry().keys());
    const publicToolNames = this.getPublicToolNames();
    return allToolNames.filter((name) => !publicToolNames.includes(name));
  }

  /**
   * Get hidden tool schema by name (for internal access)
   */
  getHiddenToolSchema(
    name: string,
  ): { description: string; schema: JSONSchema } | undefined {
    return this.toolManager.getHiddenToolSchema(name);
  }

  /**
   * Check if a tool exists (visible or hidden)
   */
  hasToolNamed(name: string): boolean {
    return this.toolManager.hasToolNamed(name);
  }

  /**
   * Configure tool behavior
   */
  configTool(toolName: string, config: ToolConfig): void {
    this.toolManager.configTool(toolName, config);
  }

  /**
   * Get tool configuration
   */
  getToolConfig(toolName: string): ToolConfig | undefined {
    return this.toolManager.getToolConfig(toolName);
  }

  /**
   * Remove tool configuration
   */
  removeToolConfig(toolName: string): boolean {
    return this.toolManager.removeToolConfig(toolName);
  }

  /**
   * Register a tool plugin with validation and error handling
   */
  async addPlugin(plugin: ToolPlugin): Promise<void> {
    await this.pluginManager.addPlugin(plugin);
  }

  /**
   * Load and register a plugin from a file path with optional parameters
   */
  async loadPluginFromPath(
    pluginPath: string,
    options: { cache?: boolean } = { cache: true },
  ): Promise<void> {
    await this.pluginManager.loadPluginFromPath(pluginPath, options);
  }

  /**
   * Apply plugins to all tools in registry and handle visibility configurations
   */
  private async processToolsWithPlugins(
    externalTools: Record<string, ComposedTool>,
    mode: ExecutionMode,
  ): Promise<void> {
    await processToolsWithPlugins(this, externalTools, mode);
  }

  /**
   * Dispose all plugins and cleanup resources
   */
  async disposePlugins(): Promise<void> {
    await this.pluginManager.dispose();
  }

  /**
   * Close the server and ensure all plugins are disposed
   */
  override async close(): Promise<void> {
    await this.disposePlugins();
    await super.close();
  }

  async compose(
    name: string | null,
    description: string,
    depsConfig: MCPSetting = { mcpServers: {} },
    options: ComposeDefinition["options"] = { mode: "agentic" },
  ) {
    const refDesc = options.refs?.join("") ?? "";
    const { tagToResults } = parseTags(description + refDesc, ["tool", "fn"]);

    // Trigger composeStart hooks before composition begins
    await this.pluginManager.triggerComposeStart({
      serverName: name ?? "anonymous",
      description,
      mode: options.mode ?? "agentic",
      server: this,
      availableTools: [],
    });

    tagToResults.tool.forEach((toolEl: any) => {
      const toolName = toolEl.attribs.name;
      const toolDescription = toolEl.attribs.description;
      const isHidden = toolEl.attribs.hide !== undefined;
      const isPublic = toolEl.attribs.global !== undefined; // XML "global" maps to "public"

      if (toolName) {
        this.toolManager.configTool(toolName, {
          description: toolDescription,
          visibility: {
            hidden: isHidden,
            public: isPublic,
          },
        });
      }
    });

    // Filter tools and transform scoped tool names to valid action identifiers
    const toolNameToIdMapping = new Map<string, string>();
    const requestedToolNames = new Set<string>();
    const availableToolNames = new Set<string>();
    const allPlaceholderUsages: string[] = [];

    // Collect all requested tool names from XML tags
    tagToResults.tool.forEach((tool: any) => {
      if (tool.attribs.name) {
        const originalName = tool.attribs.name;
        const toolName = sanitizePropertyKey(originalName);
        // Track __ALL__ placeholder usages separately for special warning
        if (
          toolName.endsWith(`_${ALL_TOOLS_PLACEHOLDER}`) ||
          toolName === ALL_TOOLS_PLACEHOLDER
        ) {
          allPlaceholderUsages.push(originalName);
        } else {
          requestedToolNames.add(toolName);
        }
      }
    });

    const { tools, cleanupClients } = (await composeMcpDepTools(
      depsConfig,
      ({ mcpName, toolNameWithScope, toolId }: any) => {
        toolNameToIdMapping.set(toolNameWithScope, toolId);

        // Track all available tool names for warning purposes
        availableToolNames.add(toolNameWithScope);
        availableToolNames.add(toolId);

        // Populate server-level name mappings for easier resolution at runtime
        // 1) Map fully-scoped name (e.g., "server.SearchLog") -> toolId
        this.toolManager.setToolNameMapping(toolNameWithScope, toolId);

        // 2) Map bare internal tool name when unambiguous
        //    Extract internal part after the first dot if present
        const internalName = toolNameWithScope.includes(".")
          ? toolNameWithScope.split(".").slice(1).join(".")
          : toolNameWithScope;
        if (!this.toolNameMapping.has(internalName)) {
          this.toolManager.setToolNameMapping(internalName, toolId);
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

    // Warn about unmatched tool names
    // Register external tools and merge with registry
    Object.entries(tools).forEach(([toolId, tool]) => {
      this.toolManager.registerTool(
        toolId,
        tool.description || "",
        tool.inputSchema as JSONSchema,
        tool.execute,
      );
    });

    const registeredTools = this.toolManager.getRegisteredToolsAsComposed();
    const allTools = { ...tools };
    Object.entries(registeredTools).forEach(([toolName, tool]) => {
      if (!allTools[toolName]) {
        allTools[toolName] = tool;
      }
      availableToolNames.add(toolName);
    });

    // Warn about __ALL__ placeholder usages - suggest using specific tool names
    if (allPlaceholderUsages.length > 0) {
      await this.logger.warning(
        `Found ${allPlaceholderUsages.length} __ALL__ placeholder(s) for agent "${name}":`,
      );
      allPlaceholderUsages.forEach((usage) => {
        this.logger.warning(
          `   • "${usage}" - consider using specific tool names`,
        );
      });
      const available = Array.from(availableToolNames).sort().join(", ");
      await this.logger.warning(`   Available tools: ${available}`);
    }

    // Warn about unmatched tool names against final tool set
    const unmatchedTools = Array.from(requestedToolNames).filter(
      (toolName) => !allTools[toolName],
    );
    if (unmatchedTools.length > 0) {
      await this.logger.warning(`Tool matching warnings for agent "${name}":`);
      unmatchedTools.forEach((toolName) => {
        this.logger.warning(`   • Tool not found: "${toolName}"`);
      });
      const available = Array.from(availableToolNames).sort().join(", ");
      await this.logger.warning(`   Available tools: ${available}`);
    }

    // Trigger transformation hooks for all tools (transformTool)
    await this.processToolsWithPlugins(allTools, options.mode ?? "agentic");

    // Trigger finalizeComposition hooks after transformation
    await this.pluginManager.triggerFinalizeComposition(allTools, {
      serverName: name ?? "anonymous",
      mode: options.mode ?? "agentic",
      server: this,
      toolNames: Object.keys(allTools),
    });

    // Cleanup clients when server is closed (pretty-printed to match logging plugin)
    this.onclose = async () => {
      await cleanupClients();
      await this.disposePlugins();
      await this.logger.info(
        `[${name}] Event: closed - cleaned up dependent clients and plugins`,
      );
    };

    this.onerror = async (error) => {
      await this.logger.error(
        `[${name}] Event: error - ${error?.stack ?? String(error)}`,
      );
      await cleanupClients();
      await this.disposePlugins();
      await this.logger.info(
        `[${name}] Action: cleaned up dependent clients and plugins`,
      );
    };

    const toolNameToDetailList = Object.entries(allTools);

    // Get public and hidden tool names
    const publicToolNames = this.getPublicToolNames();
    const hiddenToolNames = this.getHiddenToolNames();

    // Tools visible in agent context = all tools except hidden ones
    const contextToolNames = toolNameToDetailList
      .map(([name]) => name)
      .filter((n) => !hiddenToolNames.includes(n));

    // Add public tools to server (these are exposed to MCP clients)
    publicToolNames.forEach((toolId) => {
      const tool = allTools[toolId];
      if (!tool) {
        throw new Error(
          `Public tool ${toolId} not found in registry, available: ${
            Object.keys(
              allTools,
            ).join(", ")
          }`,
        );
      }
      // Register tool and mark as public
      this.tool(
        toolId,
        tool.description || "",
        jsonSchema(tool.inputSchema as any),
        tool.execute,
        { internal: false }, // Not internal, will be added to publicTools
      );
    });

    // Trigger composition complete hooks with simplified stats
    await this.pluginManager.triggerComposeEnd({
      toolName: name,
      pluginNames: this.pluginManager.getPluginNames(),
      mode: options.mode ?? "agentic",
      server: this,
      stats: {
        totalTools: this.toolManager.getTotalToolCount(),
        publicTools: publicToolNames.length,
        hiddenTools: hiddenToolNames.length,
      },
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
      tools: allTools,
      toolOverrides: new Map(), // We'll need to expose this differently
      toolNameMapping: toolNameToIdMapping,
    });

    // All tools visible in agent context (not hidden)
    const allToolNames = contextToolNames;

    // Build dependency groups using the helper function (simplified)
    const depGroups = buildDependencyGroups(
      toolNameToDetailList,
      hiddenToolNames, // Only hidden tools are excluded
      publicToolNames, // Tools marked as public
      this,
    );

    const mode = options.mode ?? "agentic";
    const context = {
      server: this,
      name,
      description,
      mode,
      allToolNames,
      toolNameToDetailList,
      depGroups,
      toolNameToIdMapping,
      publicToolNames,
      hiddenToolNames,
      options,
    };

    // Trigger registerAgentTool hook - last plugin wins
    const handled = await this.pluginManager.triggerRegisterAgentTool(context);

    if (!handled) {
      throw new Error(
        `No plugin registered to handle execution mode "${mode}". ` +
          `Did you override the default mode plugin, but in the wrong way?`,
      );
    }
  }
}
