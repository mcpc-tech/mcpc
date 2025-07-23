import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type Tool,
  type Implementation,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { jsonSchema, type Schema } from "ai";
import type { McpSettingsSchema } from "./service/tools.ts";
import {
  Server,
  type ServerOptions,
} from "@modelcontextprotocol/sdk/server/index.js";
import type z from "zod";
import { composeMcpDepTools, parseTags } from "../mod.ts";
import type { ComposeDefination } from "./set-up-mcp-compose.ts";
import { updateRefPaths } from "./utils/common/schema.ts";
import type { ToolCallback, JSONSchema } from "./types.ts";
import { registerAgenticTool } from "./workflow/agentic-tool-registrar.ts";
import { registerAgenticWorkflowTool } from "./workflow/workflow-tool-registrar.ts";

const ALL_TOOLS_PLACEHOLDER = "__ALL__";
const ACTION_KEY = "action";

export interface ToolOverrideOptions {
  description?: string;
  hide?: boolean;
  args?: (originalArgs: unknown) => unknown;
  handler?: ToolCallback;
}

export class ComposableMCPServer extends Server {
  private tools: Tool[] = [];
  private nameToCb: Map<string, ToolCallback> = new Map();
  private internalTools: Map<string, { callback: ToolCallback; description: string; schema: JSONSchema }> = new Map();
  private hiddenTools: Map<string, ToolCallback> = new Map(); // Separate storage for hidden tools
  private composedTools: Map<string, ToolCallback> = new Map();
  private toolOverrides: Map<string, ToolOverrideOptions> = new Map();
  // Store mapping between dot notation and underscore notation for tool names
  private toolNameMapping: Map<string, string> = new Map();

  constructor(_serverInfo: Implementation, options: ServerOptions) {
    super(_serverInfo, options);
  }

  /**
   * Resolve a tool name to its internal format, supporting both dot and underscore notation
   */
  private resolveToolName(name: string): string | undefined {
    // Try exact match first
    if (
      this.nameToCb.has(name) ||
      this.internalTools.has(name) ||
      this.hiddenTools.has(name) ||
      this.composedTools.has(name)
    ) {
      return name;
    }

    // Try mapping lookup (both directions)
    const mappedName = this.toolNameMapping.get(name);
    if (
      mappedName &&
      (this.nameToCb.has(mappedName) ||
        this.internalTools.has(mappedName) ||
        this.hiddenTools.has(mappedName) ||
        this.composedTools.has(mappedName))
    ) {
      return mappedName;
    }

    return undefined;
  }

  tool<T>(
    name: string,
    description: string,
    paramsSchema: Schema<T>,
    cb: (args: T, extra?: unknown) => unknown,
    internal: boolean = false
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
        schema: paramsSchema.jsonSchema as JSONSchema
      });
    }

    this.setRequestHandler(ListToolsRequestSchema, () => {
      return { tools: this.tools };
    });

    this.setRequestHandler(CallToolRequestSchema, (request, extra) => {
      const { name: n, arguments: args } = request.params;

      // Check if there's an override with custom handler
      const override = this.toolOverrides.get(n);
      if (override?.handler) {
        const processedArgs = override.args ? override.args(args) : args;
        return override.handler(processedArgs, extra) as CallToolResult;
      }

      // Check regular tools
      const callback = this.nameToCb.get(n);
      if (callback) {
        const processedArgs = override?.args ? override.args(args) : args;
        return callback(processedArgs, extra) as CallToolResult;
      }

      // Check internal tools
      const internalTool = this.internalTools.get(n);
      if (internalTool) {
        const processedArgs = override?.args ? override.args(args) : args;
        return internalTool.callback(processedArgs, extra) as CallToolResult;
      }

      throw new Error(`Tool ${n} not found`);
    });
  }

  /**
   * Register a tool override with description, hide, args transformation, and/or custom handler
   */
  /**
   * Call any registered tool directly, whether it's public or internal
   */
  async callTool(name: string, args: unknown): Promise<unknown> {
    const resolvedName = this.resolveToolName(name);
    if (!resolvedName) {
      throw new Error(`Tool ${name} not found`);
    }

    const callback =
      this.nameToCb.get(resolvedName) ||
      this.internalTools.get(resolvedName)?.callback ||
      this.hiddenTools.get(resolvedName) ||
      this.composedTools.get(resolvedName);

    if (!callback) {
      throw new Error(`Tool ${name} not found`);
    }

    // Apply args transformation if override exists
    const override =
      this.toolOverrides.get(name) || this.toolOverrides.get(resolvedName);
    const processedArgs = override?.args ? override.args(args) : args;

    return await callback(processedArgs);
  }

  /**
   * @deprecated Use callTool() instead. This method will be removed in a future version.
   */
  callInternalTool(name: string, args: unknown): Promise<unknown> {
    console.warn(`callInternalTool() is deprecated. Use callTool() instead for: ${name}`);
    return this.callTool(name, args);
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
  getInternalToolSchema(name: string): { description: string; schema: JSONSchema } | undefined {
    const internalTool = this.internalTools.get(name);
    if (internalTool) {
      return {
        description: internalTool.description,
        schema: internalTool.schema
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

  async compose(
    name: string,
    description: string,
    depsConfig: z.infer<typeof McpSettingsSchema> = { mcpServers: {} },
    options: ComposeDefination["options"] = { mode: "agentic" }
  ) {
    const { tagToResults, $ } = parseTags(description, ["tool", "fn"]);

    // Process tool overrides from description
    tagToResults.tool.forEach((toolEl) => {
      const toolName = toolEl.attribs.name;
      const toolDescription = toolEl.attribs.description;
      const isHidden = toolEl.attribs.hide !== undefined;

      if (toolName && (toolDescription || isHidden)) {
        this.toolOverrides.set(toolName, {
          description: toolDescription,
          hide: isHidden,
        });
      }
    });

    // Filter tools and transform scoped tool names to valid action identifierss
    const tools = await composeMcpDepTools(
      depsConfig,
      ({ mcpName, toolNameWithScope, toolId }) => {
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

          description = description.replace(
            $(tool).prop("outerHTML")!,
            `<action ${ACTION_KEY}="${toolId}"/>`
          );
          if (selectAll) {
            return true;
          }
          return (
            tool.attribs.name === toolNameWithScope ||
            tool.attribs.name === toolId
          );
        });
      }
    );

    // Apply tool overrides
    Object.entries(tools).forEach(([toolId, tool]) => {
      // Check both the internal toolId and any user-friendly names from overrides
      let override = this.toolOverrides.get(toolId);

      // If no direct override found, check if we have an override for the dot notation equivalent
      if (!override) {
        for (const [
          overrideName,
          overrideOptions,
        ] of this.toolOverrides.entries()) {
          // Build the mapping during processing
          const dotNotationId = toolId.replace(/_/g, ".");
          const underscoreNotationId = overrideName.replace(/\./g, "_");

          if (
            overrideName === dotNotationId ||
            underscoreNotationId === toolId
          ) {
            override = overrideOptions;
            // Store bidirectional mapping for future lookups
            this.toolNameMapping.set(dotNotationId, toolId);
            this.toolNameMapping.set(toolId, dotNotationId);
            break;
          }
        }
      }

      if (override) {
        if (override.description) {
          tool.description = override.description;
        }
        if (override.handler) {
          // Replace the tool's execute function with the custom handler
          tool.execute = override.handler;
        }
        if (override.hide) {
          // Move to hidden tools instead of internal tools
          const finalHandler = override.handler || tool.execute;
          this.hiddenTools.set(toolId, finalHandler);
          delete tools[toolId];
        }
      }
    });

    // Store composed tools for callInternalTool access
    Object.entries(tools).forEach(([toolId, tool]) => {
      this.composedTools.set(toolId, tool.execute);
    });

    const toolNameToDetailList = Object.entries(tools);
    const externalToolNames = toolNameToDetailList.map(([name]) => name);
    const internalToolNames = this.getInternalToolNames();
    
    // For agentic interface: external tools (non-hidden) + internal tools
    const allToolNames = [...externalToolNames, ...internalToolNames];
    console.log(`[${name}][composed tools] external: ${externalToolNames.join(', ')} | internal: ${internalToolNames.join(', ')}`);

    const depGroups: Record<string, unknown> = {};
    toolNameToDetailList.forEach(([toolName, tool]) => {
      if (!tool) {
        throw new Error(
          `Action ${toolName} not found, available action list: ${allToolNames.join(
            ", "
          )}`
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
        baseSchema.type === "object" && baseSchema.required
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

    switch (options.mode) {
      case "agentic":
        registerAgenticTool(this, {
          description,
          name,
          allToolNames,
          depGroups,
          toolNameToDetailList,
        });
        return;
      case "agentic_workflow":
        registerAgenticWorkflowTool(this, {
          description,
          name,
          allToolNames,
          depGroups,
          toolNameToDetailList,
          predefinedSteps: options.steps,
        });
        return;
    }
  }
}

/**
 * Registers all tools from the composed MCP dependencies with a server.
 */
export function registerDepTools(
  server: ComposableMCPServer,
  tools: Record<string, unknown>
): ComposableMCPServer {
  Object.entries(tools).forEach(([name, tool]) => {
    const typedTool = tool as {
      description?: string;
      parameters: { jsonSchema: JSONSchema };
      execute: ToolCallback;
    };
    // Register the tool with the server
    server.tool(
      name,
      typedTool.description ?? "",
      jsonSchema<Record<string, unknown>>(typedTool.parameters.jsonSchema),
      typedTool.execute
    );
  });

  return server as ComposableMCPServer;
}
