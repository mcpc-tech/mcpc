import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ajv } from "ajv";
import { AggregateAjvError } from "@segment/ajv-human-errors";
import addFormats from "ajv-formats";
import type { ComposableMCPServer } from "../../compose.ts";
import { CompiledPrompts } from "../../prompts/index.ts";
import { createLogger, type MCPLogger } from "../../utils/logger.ts";
import type { Span } from "@opentelemetry/api";
import { endSpan, initializeTracing, startSpan } from "../../utils/tracing.ts";
import process from "node:process";

const ajv = new Ajv({
  allErrors: true,
  verbose: true,
});

addFormats.default(ajv);

export class AgenticExecutor {
  private logger: MCPLogger;
  private tracingEnabled: boolean = false;

  constructor(
    private name: string,
    private allToolNames: string[],
    private toolNameToDetailList: [string, unknown][],
    private server: ComposableMCPServer,
    private ACTION_KEY: string = "action",
    private NEXT_ACTION_KEY: string = "nextAction",
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
      ? startSpan("mcpc.agentic_execute", {
        agent: this.name,
        action: String(args[this.ACTION_KEY] ?? "unknown"),
        nextAction: String(args[this.NEXT_ACTION_KEY] ?? "none"),
        args: JSON.stringify(args),
      }, parentSpan ?? undefined)
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
          action: args[this.ACTION_KEY],
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

      const actionName = args[this.ACTION_KEY] as string;

      // Update span name to include action
      if (executeSpan && actionName) {
        try {
          const safeAction = String(actionName).replace(/\s+/g, "_");
          if (typeof (executeSpan as any).updateName === "function") {
            (executeSpan as any).updateName(
              `mcpc.agentic_execute.${safeAction}`,
            );
          }
        } catch {
          // Ignore errors while updating span name
        }
      }

      // First check external tools
      const currentTool = this.toolNameToDetailList.find(
        ([name, _detail]: [string, unknown]) => name === actionName,
      )?.[1] as
        | { execute: (args: unknown) => Promise<CallToolResult> }
        | undefined;

      if (currentTool) {
        // Execute external tool
        const nextAction = args[this.NEXT_ACTION_KEY] as string;

        if (executeSpan) {
          executeSpan.setAttributes({
            toolType: "external",
            actionName: actionName,
            nextAction: nextAction || "none",
          });
        }

        this.logger.debug({
          message: "Executing external tool",
          action: actionName,
          nextAction: nextAction,
        });

        const currentResult = await currentTool.execute({
          ...(args[actionName] as Record<string, unknown>),
        });

        if (args[nextAction]) {
          currentResult?.content?.push({
            type: "text",
            text: CompiledPrompts.actionSuccess({
              toolName: this.name,
              nextAction: nextAction,
              currentAction: actionName,
            }),
          });
        } else {
          currentResult?.content?.push({
            type: "text",
            text: CompiledPrompts.planningPrompt({
              currentAction: actionName,
              toolName: this.name,
            }),
          });
        }

        if (executeSpan) {
          executeSpan.setAttributes({
            success: true,
            isError: !!currentResult.isError,
            resultContentLength: currentResult.content?.length || 0,
            hasNextAction: !!args[nextAction],
            toolResult: JSON.stringify(currentResult),
          });
          endSpan(executeSpan);
        }

        return currentResult;
      }

      // If not found in external tools, check internal tools
      if (this.allToolNames.includes(actionName)) {
        if (executeSpan) {
          executeSpan.setAttributes({
            toolType: "internal",
            actionName: actionName,
          });
        }

        this.logger.debug({
          message: "Executing internal tool",
          action: actionName,
        });

        try {
          const result = await this.server.callTool(
            actionName,
            args[actionName] as Record<string, unknown>,
          );

          const nextAction = args[this.NEXT_ACTION_KEY] as string;
          const callToolResult = (result as CallToolResult) ?? { content: [] };

          if (nextAction && this.allToolNames.includes(nextAction)) {
            callToolResult.content.push({
              type: "text",
              text: CompiledPrompts.actionSuccess({
                toolName: this.name,
                nextAction: nextAction,
                currentAction: actionName,
              }),
            });
          } else {
            callToolResult.content.push({
              type: "text",
              text: CompiledPrompts.planningPrompt({
                currentAction: actionName,
                toolName: this.name,
              }),
            });
          }

          if (executeSpan) {
            executeSpan.setAttributes({
              success: true,
              isError: !!callToolResult.isError,
              resultContentLength: callToolResult.content?.length || 0,
              hasNextAction:
                !!(nextAction && this.allToolNames.includes(nextAction)),
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
            action: actionName,
            error: String(error),
          });

          return {
            content: [
              {
                type: "text",
                text: `Error executing internal tool ${actionName}: ${
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
          actionName: actionName || "unknown",
          completion: true,
        });
        endSpan(executeSpan);
      }

      this.logger.debug({
        message: "Tool not found, returning completion message",
        action: actionName,
      });

      return {
        content: [
          {
            type: "text",
            text: CompiledPrompts.completionMessage(),
          },
        ],
      };
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

  // Validate arguments using JSON schema
  validate(
    args: Record<string, unknown>,
    schema: Record<string, unknown>,
  ): {
    valid: boolean;
    error?: string;
  } {
    // Skip validation for complete decision
    if (args.decision === "complete") {
      return { valid: true };
    }
    const validate = ajv.compile(schema);
    if (!validate(args)) {
      const errors = new AggregateAjvError(validate.errors!);
      return {
        valid: false,
        error: errors.message,
      };
    }
    return { valid: true };
  }
}
