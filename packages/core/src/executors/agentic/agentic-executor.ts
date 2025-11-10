import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ComposableMCPServer } from "../../compose.ts";
import { CompiledPrompts } from "../../prompts/index.ts";
import { createLogger, type MCPLogger } from "../../utils/logger.ts";
import { validateSchema } from "../../utils/schema-validator.ts";
import type { Span } from "@opentelemetry/api";
import { endSpan, initializeTracing, startSpan } from "../../utils/tracing.ts";
import process from "node:process";

export class AgenticExecutor {
  private logger: MCPLogger;
  private tracingEnabled: boolean = false;

  constructor(
    private name: string,
    private allToolNames: string[],
    private toolNameToDetailList: [string, unknown][],
    private server: ComposableMCPServer,
    private USE_TOOL_KEY: string = "useTool",
  ) {
    this.logger = createLogger(`mcpc.agentic.${name}`, server);

    // Initialize tracing for agentic workflows (only once globally)
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
    // Create a span for this execute call
    const executeSpan: Span | null = this.tracingEnabled
      ? startSpan(
        "mcpc.agentic_execute",
        {
          agent: this.name,
          selectTool: String(args[this.USE_TOOL_KEY] ?? "unknown"),
          args: JSON.stringify(args),
        },
        parentSpan ?? undefined,
      )
      : null;

    try {
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
          selectTool: args[this.USE_TOOL_KEY],
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

      const useTool = args[this.USE_TOOL_KEY] as string;
      const definitionsOf = (args.definitionsOf as string[]) || [];
      const hasDefinitions = (args.hasDefinitions as string[]) || [];

      // Update span name to include selected tool
      if (executeSpan && useTool) {
        try {
          const safeTool = String(useTool).replace(/\s+/g, "_");
          if (typeof (executeSpan as any).updateName === "function") {
            (executeSpan as any).updateName(`mcpc.agentic_execute.${safeTool}`);
          }
        } catch {
          // Ignore errors while updating span name
        }
      }

      // First check external tools
      const currentTool = this.toolNameToDetailList.find(
        ([name, _detail]: [string, unknown]) => name === useTool,
      )?.[1] as
        | { execute: (args: unknown) => Promise<CallToolResult> }
        | undefined;

      if (currentTool) {
        // Execute external tool
        if (executeSpan) {
          executeSpan.setAttributes({
            toolType: "external",
            selectedTool: useTool,
          });
        }

        this.logger.debug({
          message: "Executing external tool",
          selectTool: useTool,
        });

        const currentResult = await currentTool.execute({
          ...(args[useTool] as Record<string, unknown>),
        });

        // Provide tool schemas if requested
        this.appendToolSchemas(currentResult, definitionsOf, hasDefinitions);

        if (executeSpan) {
          executeSpan.setAttributes({
            success: true,
            isError: !!currentResult.isError,
            resultContentLength: currentResult.content?.length || 0,
            toolResult: JSON.stringify(currentResult),
          });
          endSpan(executeSpan);
        }

        return currentResult;
      }

      // If not found in external tools, check internal tools
      if (this.allToolNames.includes(useTool)) {
        if (executeSpan) {
          executeSpan.setAttributes({
            toolType: "internal",
            selectedTool: useTool,
          });
        }

        this.logger.debug({
          message: "Executing internal tool",
          selectTool: useTool,
        });

        try {
          const result = await this.server.callTool(
            useTool,
            args[useTool] as Record<string, unknown>,
          );

          const callToolResult = (result as CallToolResult) ?? { content: [] };

          // Provide tool schemas if requested
          this.appendToolSchemas(callToolResult, definitionsOf, hasDefinitions);

          if (executeSpan) {
            executeSpan.setAttributes({
              success: true,
              isError: !!callToolResult.isError,
              resultContentLength: callToolResult.content?.length || 0,
              toolResult: JSON.stringify(callToolResult),
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
            useTool,
            error: String(error),
          });

          return {
            content: [
              {
                type: "text",
                text: `Error executing internal tool ${useTool}: ${
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
          useTool: useTool || "unknown",
          completion: true,
        });
        endSpan(executeSpan);
      }

      this.logger.debug({
        message: "Tool not found, returning completion message",
        useTool,
      });

      const result: CallToolResult = {
        content: [],
      };
      this.appendToolSchemas(result, definitionsOf, hasDefinitions);
      return result;
    } catch (error) {
      // Catch any unexpected errors
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

  // Append tool schemas to result if requested
  private appendToolSchemas(
    result: CallToolResult,
    definitionsOf: string[],
    hasDefinitions: string[],
  ): void {
    // Filter out tools that are already available
    const schemasToProvide = definitionsOf.filter(
      (toolName) => !hasDefinitions.includes(toolName),
    );

    if (schemasToProvide.length === 0) {
      return;
    }

    const definitionTexts: string[] = [];

    for (const toolName of schemasToProvide) {
      const toolDetail = this.toolNameToDetailList.find(
        ([name]) => name === toolName,
      );

      if (toolDetail) {
        const [name, schema] = toolDetail;
        const schemaJson = JSON.stringify(schema, null, 2);
        definitionTexts.push(
          `<tool_definition name="${name}">\n${schemaJson}\n</tool_definition>`,
        );
      }
    }

    if (definitionTexts.length > 0) {
      result.content.push({
        type: "text",
        text: `${definitionTexts.join("\n\n")}`,
      });
    }
  }

  // Validate arguments using JSON schema
  validate(
    args: Record<string, unknown>,
    schema: Record<string, unknown>,
  ): {
    valid: boolean;
    error?: string;
  } {
    return validateSchema(args, schema);
  }
}
