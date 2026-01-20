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

      // Handle `man` command - return tool schemas
      // Accepts both formats for compatibility:
      // - ["tool1", "tool2"]: Some models may output array directly despite schema specifying object
      // - { tools: ["tool1", "tool2"] }: Standard object format
      if (tool === "man") {
        const toolsArray = Array.isArray(args.args)
          ? args.args
          : (args.args as { tools?: string[] })?.tools;

        const createArgsDef = createArgsDefFactory(
          this.name,
          this.allToolNames,
          {},
        );
        const manSchema = createArgsDef.forMan(this.allToolNames);

        const manValidation = validateSchema(toolsArray ?? [], manSchema);
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

        return this.handleManCommand(toolsArray as string[], executeSpan);
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
    // First check external tools (from toolNameToDetailList)
    const externalTool = this.toolNameToDetailList.find(
      ([name]) => name === tool,
    );

    if (externalTool) {
      const [, toolDetail] = externalTool as [
        string,
        {
          inputSchema?: Record<string, unknown>;
          execute: (args: unknown) => Promise<CallToolResult>;
        },
      ];

      if (executeSpan) {
        executeSpan.setAttributes({
          toolType: "external",
          selectedTool: tool,
        });
      }

      // Runtime validation using tool's inputSchema
      if (toolDetail.inputSchema) {
        // Extract raw JSON Schema from wrapped schema format
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

      this.logger.debug({
        message: "Executing external tool",
        tool,
      });

      const result = await toolDetail.execute(toolArgs);

      if (executeSpan) {
        executeSpan.setAttributes({
          success: true,
          isError: !!result.isError,
          resultContentLength: result.content?.length || 0,
        });
        endSpan(executeSpan);
      }

      return result;
    }

    // Check internal tools (from server)
    if (this.allToolNames.includes(tool)) {
      if (executeSpan) {
        executeSpan.setAttributes({
          toolType: "internal",
          selectedTool: tool,
        });
      }

      this.logger.debug({
        message: "Executing internal tool",
        tool,
      });

      try {
        const result = await this.server.callTool(tool, toolArgs);
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
          message: "Error executing internal tool",
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

    // Tool not found
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

  validate(
    args: Record<string, unknown>,
    schema: Record<string, unknown>,
  ): { valid: boolean; error?: string } {
    return validateSchema(args, schema);
  }
}
