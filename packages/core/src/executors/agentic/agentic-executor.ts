import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ComposableMCPServer } from "../../compose.ts";
import { createArgsDefFactory } from "../../factories/args-def-factory.ts";
import { CompiledPrompts } from "../../prompts/index.ts";
import { createLogger, type MCPLogger } from "../../utils/logger.ts";
import { validateSchema } from "../../utils/schema-validator.ts";
import { cleanToolSchema } from "../../utils/common/provider.ts";
import { extractJsonSchema } from "../../utils/schema.ts";
import type { Span } from "@opentelemetry/api";
import { endSpan, initializeTracing, startSpan } from "../../utils/tracing.ts";
import process from "node:process";

/**
 * AgenticExecutor - Simplified agentic executor using Unix-style `man` command
 *
 * Key features:
 * - Uses `tool` + `args` for a clean, consistent interface
 * - `man` command for fetching tool schemas (like Unix manual)
 * - No `hasDefinitions` - trusts model's context memory
 * - Runtime validation of tool args using each tool's inputSchema
 */
export class AgenticExecutor {
  private logger: MCPLogger;
  private tracingEnabled: boolean = false;
  private toolSchemaMap: Map<string, unknown>;

  constructor(
    private name: string,
    private allToolNames: string[],
    private toolNameToDetailList: [string, unknown][],
    private server: ComposableMCPServer,
    private manual?: string,
  ) {
    this.logger = createLogger(`mcpc.agentic.${name}`, server);
    this.toolSchemaMap = new Map(toolNameToDetailList);

    // Initialize tracing
    try {
      this.tracingEnabled = process.env.MCPC_TRACING_ENABLED === "true";
      if (this.tracingEnabled) {
        initializeTracing({
          enabled: true,
          serviceName: `mcpc-agentic-${name}`,
          exportTo: (process.env.MCPC_TRACING_EXPORT ?? "otlp") as
            | "console"
            | "otlp"
            | "none",
          otlpEndpoint: process.env.MCPC_TRACING_OTLP_ENDPOINT ??
            "http://localhost:4318/v1/traces",
        });
      }
    } catch {
      this.tracingEnabled = false;
    }
  }

  async execute(
    args: Record<string, unknown>,
    schema: Record<string, unknown>,
    parentSpan?: Span | null,
  ): Promise<CallToolResult> {
    const executeSpan: Span | null = this.tracingEnabled
      ? startSpan(
        "mcpc.agentic_execute",
        {
          agent: this.name,
          tool: String(args.tool ?? "unknown"),
          args: JSON.stringify(args),
        },
        parentSpan ?? undefined,
      )
      : null;

    try {
      // Validate top-level schema (tool enum, args object)
      const validationResult = this.validate(args, schema);
      if (!validationResult.valid) {
        if (executeSpan) {
          executeSpan.setAttributes({
            validationError: true,
            errorMessage: validationResult.error || "Validation failed",
          });
          endSpan(executeSpan);
        }

        this.logger.warning({
          message: "Validation failed",
          tool: args.tool,
          error: validationResult.error,
        });

        return {
          content: [
            {
              type: "text",
              text: CompiledPrompts.errorResponse({
                errorMessage: validationResult.error || "Validation failed",
              }),
            },
          ],
          isError: true,
        };
      }

      const tool = args.tool as string;

      // Handle `man` command - return tool schemas and/or manual
      // Keep the shape stable: args must include `tools`, and can optionally include `manual: true`.
      // - { tools: ["tool1", "tool2"] } -> tool schemas
      // - { tools: [], manual: true } -> manual only
      // - { tools: ["tool1"], manual: true } -> tool schemas + manual
      if (tool === "man") {
        const createArgsDef = createArgsDefFactory(
          this.name,
          this.allToolNames,
          {},
        );
        const manSchema = createArgsDef.forMan(this.allToolNames);

        const manValidation = validateSchema(args.args ?? {}, manSchema);
        if (!manValidation.valid) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid args for "man": ${manValidation.error}`,
              },
            ],
            isError: true,
          };
        }

        const argsObj = args.args as { tools: string[]; manual?: boolean };
        const tools = argsObj.tools ?? [];
        const wantManual = argsObj.manual === true;
        const wantTools = tools.length > 0;

        if (wantTools && wantManual) {
          const toolSchemas = this.handleManCommand(tools, null);
          const manualResult = this.handleManualRequest(null);

          if (executeSpan) {
            executeSpan.setAttributes({
              toolType: "man",
              requestType: "tools+manual",
            });
            endSpan(executeSpan);
          }

          return {
            content: [
              ...toolSchemas.content,
              { type: "text", text: "\n---\n" },
              ...manualResult.content,
            ],
          };
        }

        if (wantManual) {
          return this.handleManualRequest(executeSpan);
        }

        return this.handleManCommand(tools, executeSpan);
      }

      // Execute the selected tool
      const toolArgs = (args.args as Record<string, unknown>) || {};
      return await this.executeTool(tool, toolArgs, executeSpan);
    } catch (error) {
      if (executeSpan) {
        endSpan(executeSpan, error as Error);
      }

      this.logger.error({
        message: "Unexpected error in execute",
        error: String(error),
      });

      return {
        content: [
          {
            type: "text",
            text: `Unexpected error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Handle `man { manual: true }` - return full manual for progressive disclosure
   */
  private handleManualRequest(executeSpan: Span | null): CallToolResult {
    if (executeSpan) {
      executeSpan.setAttributes({
        toolType: "man",
        requestType: "manual",
      });
    }

    if (!this.manual) {
      if (executeSpan) {
        endSpan(executeSpan);
      }
      return {
        content: [
          {
            type: "text",
            text: "No manual available for this agent.",
          },
        ],
      };
    }

    if (executeSpan) {
      executeSpan.setAttributes({
        success: true,
      });
      endSpan(executeSpan);
    }

    // Return manual content directly (no wrapper template needed)
    return {
      content: [
        {
          type: "text",
          text: this.manual,
        },
      ],
    };
  }

  /**
   * Handle `man` command - return schemas for requested tools
   * @param requestedTools - Array of tool names (already validated via JSON Schema)
   */
  private handleManCommand(
    requestedTools: string[],
    executeSpan: Span | null,
  ): CallToolResult {
    if (executeSpan) {
      executeSpan.setAttributes({
        toolType: "man",
        requestedTools: requestedTools.join(","),
      });
    }

    // Return schemas
    const schemas = requestedTools
      .map((toolName) => {
        const toolDetail = this.toolSchemaMap.get(toolName);
        if (toolDetail) {
          // Clean internal fields before returning
          const cleanedSchema = cleanToolSchema(
            toolDetail as Record<string, unknown>,
          );
          return `<tool_definition name="${toolName}">\n${
            JSON.stringify(cleanedSchema, null, 2)
          }\n</tool_definition>`;
        }
        return null;
      })
      .filter(Boolean);

    if (executeSpan) {
      executeSpan.setAttributes({
        schemasReturned: schemas.length,
        success: true,
      });
      endSpan(executeSpan);
    }

    return {
      content: [
        {
          type: "text",
          text: schemas.length > 0
            ? schemas.join("\n\n")
            : "No schemas found for requested tools.",
        },
      ],
    };
  }

  /**
   * Execute a tool with runtime validation
   */
  private async executeTool(
    tool: string,
    toolArgs: Record<string, unknown>,
    executeSpan: Span | null,
  ): Promise<CallToolResult> {
    // Check if tool exists (either in toolNameToDetailList or allToolNames)
    const isExternalTool = this.toolNameToDetailList.some(
      ([name]) => name === tool,
    );
    const isInternalTool = this.allToolNames.includes(tool);

    if (!isExternalTool && !isInternalTool) {
      // Tool not found - handled at the end
      if (executeSpan) {
        executeSpan.setAttributes({
          toolType: "not_found",
          tool,
        });
        endSpan(executeSpan);
      }

      return {
        content: [
          {
            type: "text",
            text: `Tool "${tool}" not found. Available tools: ${
              this.allToolNames.join(", ")
            }`,
          },
        ],
        isError: true,
      };
    }

    // For external tools, validate args first using schema from toolNameToDetailList
    if (isExternalTool) {
      const externalTool = this.toolNameToDetailList.find(
        ([name]) => name === tool,
      );
      const [, toolDetail] = externalTool as [
        string,
        {
          inputSchema?: Record<string, unknown>;
          execute: (args: unknown) => Promise<CallToolResult>;
        },
      ];

      // Runtime validation using tool's inputSchema
      if (toolDetail.inputSchema) {
        const rawSchema = extractJsonSchema(toolDetail.inputSchema as any);
        const validation = validateSchema(toolArgs, rawSchema);
        if (!validation.valid) {
          if (executeSpan) {
            executeSpan.setAttributes({
              validationError: true,
              errorMessage: validation.error,
            });
            endSpan(executeSpan);
          }

          return {
            content: [
              {
                type: "text",
                text:
                  `Parameter validation failed for "${tool}": ${validation.error}`,
              },
            ],
            isError: true,
          };
        }
      }
    }

    // Execute tool via server.callTool to ensure transformTool hooks are applied
    const toolType = isExternalTool ? "external" : "internal";
    if (executeSpan) {
      executeSpan.setAttributes({
        toolType,
        selectedTool: tool,
      });
    }

    this.logger.debug({
      message: `Executing ${toolType} tool`,
      tool,
    });

    try {
      // Pass agent context for lifecycle hooks
      const result = await this.server.callTool(tool, toolArgs, {
        agentName: this.name,
      });
      const callToolResult = (result as CallToolResult) ?? { content: [] };

      if (executeSpan) {
        executeSpan.setAttributes({
          success: true,
          isError: !!callToolResult.isError,
          resultContentLength: callToolResult.content?.length || 0,
        });
        endSpan(executeSpan);
      }

      return callToolResult;
    } catch (error) {
      if (executeSpan) {
        endSpan(executeSpan, error as Error);
      }

      this.logger.error({
        message: `Error executing ${toolType} tool`,
        tool,
        error: String(error),
      });

      return {
        content: [
          {
            type: "text",
            text: `Error executing tool "${tool}": ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  validate(
    args: Record<string, unknown>,
    schema: Record<string, unknown>,
  ): { valid: boolean; error?: string } {
    return validateSchema(args, schema);
  }
}
