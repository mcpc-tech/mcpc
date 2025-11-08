/**
 * Code Execution Executor
 *
 * Implements efficient MCP interaction using code execution pattern.
 * Key features:
 * - Progressive disclosure: Load tool definitions on-demand
 * - Context efficiency: Process data in execution environment
 * - Reduced token usage: Filter/transform data before returning to model
 *
 * Based on: https://www.anthropic.com/engineering/code-execution-with-mcp
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ComposableMCPServer } from "../../compose.ts";
import { CompiledPrompts } from "../../prompts/index.ts";
import { createLogger, type MCPLogger } from "../../utils/logger.ts";
import { validateSchema } from "../../utils/schema-validator.ts";
import type { Span } from "@opentelemetry/api";
import { endSpan, initializeTracing, startSpan } from "../../utils/tracing.ts";
import process from "node:process";

export class CodeExecutionExecutor {
  private logger: MCPLogger;
  private tracingEnabled: boolean = false;

  constructor(
    private name: string,
    private allToolNames: string[],
    private toolNameToDetailList: [string, unknown][],
    private server: ComposableMCPServer,
    private publicToolNames: string[],
    private hiddenToolNames: string[],
  ) {
    this.logger = createLogger(`mcpc.code-execution.${name}`, server);

    // Initialize tracing
    try {
      this.tracingEnabled = process.env.MCPC_TRACING_ENABLED === "true";
      if (this.tracingEnabled) {
        initializeTracing({
          enabled: true,
          serviceName: `mcpc-code-execution-${name}`,
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
    const definitionsOf = (args.definitionsOf as string[]) || [];
    const hasDefinitions = (args.hasDefinitions as string[]) || [];
    const needsDefinitions = definitionsOf.filter(
      (def) => !hasDefinitions.includes(def),
    );

    const executeSpan: Span | null = this.tracingEnabled
      ? startSpan(
        "mcpc.code_execution_execute",
        {
          agent: this.name,
          hasCode: Boolean(args.code),
          needsDefinitions: needsDefinitions.length > 0,
        },
        parentSpan ?? undefined,
      )
      : null;

    try {
      const validationResult = validateSchema(args, schema);
      if (!validationResult.valid) {
        if (executeSpan) {
          executeSpan.setAttributes({
            validationError: true,
            errorMessage: validationResult.error || "Validation failed",
          });
          endSpan(executeSpan);
        }

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

      const hasCode = Boolean(args.code);

      // Build combined result
      const contentParts: Array<{ type: "text"; text: string }> = [];

      if (hasCode && hasDefinitions.length > 0) {
        const codeResult = await this.handleExecuteCode(args, executeSpan);

        // If code execution failed, return error immediately
        if (codeResult.isError) {
          if (executeSpan) {
            endSpan(executeSpan);
          }
          return codeResult;
        }

        if (codeResult.content) {
          contentParts.push(
            ...codeResult.content.filter((c) => c.type === "text"),
          );
        }
      }

      // Get definitions if requested
      if (needsDefinitions.length > 0) {
        const definitionsResult = this.getToolDefinitions(needsDefinitions);
        if (definitionsResult.content) {
          contentParts.push(
            ...definitionsResult.content.filter((c) => c.type === "text"),
          );
        }

        if (executeSpan) {
          executeSpan.setAttribute("toolsRequested", needsDefinitions.length);
        }
      }

      if (executeSpan) {
        endSpan(executeSpan);
      }

      const combinedText = contentParts.map((part) => part.text).join("\n");

      return {
        content: [
          {
            type: "text",
            text: combinedText ||
              "No output generated, use console.log() to log output",
          },
        ],
      };
    } catch (error) {
      if (executeSpan) {
        executeSpan.setAttribute("error", true);
        executeSpan.setAttribute("errorMessage", String(error));
        endSpan(executeSpan);
      }

      this.logger.error({
        message: "Code execution error",
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        content: [
          {
            type: "text",
            text: `Error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Execute JavaScript code with access to MCP tools
   * Simple implementation using new Function()
   */
  private async handleExecuteCode(
    args: Record<string, unknown>,
    span?: Span | null,
  ): Promise<CallToolResult> {
    const code = String(args.code || "");

    if (!code) {
      return {
        content: [
          {
            type: "text",
            text: "Error: No code provided",
          },
        ],
        isError: true,
      };
    }

    if (span) {
      span.setAttribute("codeLength", code.length);
    }

    this.logger.info({
      message: "Executing code",
      codeLength: code.length,
    });

    try {
      // Capture console output
      const logs: string[] = [];
      const consoleProxy = {
        log: (...args: unknown[]) => {
          logs.push(
            args
              .map((a) => {
                // Stringify objects for better readability
                if (typeof a === "object" && a !== null) {
                  return JSON.stringify(a, null, 2);
                }
                return String(a);
              })
              .join(" "),
          );
        },
        error: (...args: unknown[]) => {
          logs.push("ERROR: " + args.map((a) => String(a)).join(" "));
        },
      };

      // API to call MCP tools from code
      const callMCPTool = async (toolName: string, params: unknown) => {
        this.logger.info({
          message: "Code calling MCP tool",
          toolName,
        });

        return await this.server.callTool(toolName, params);
      };

      // Create and execute function with injected APIs
      const fn = new Function(
        "console",
        "callMCPTool",
        `return (async () => { ${code} })();`,
      );

      const result = await fn(consoleProxy, callMCPTool);

      // Format output
      const output = [
        logs.length > 0 ? "**Output:**\n" + logs.join("\n") : "",
        result !== undefined
          ? `\n**Result:** ${JSON.stringify(result, null, 2)}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: output ||
              "Code executed successfully (no output), use console.log() to log output",
          },
        ],
      };
    } catch (error) {
      this.logger.error({
        message: "Code execution failed",
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        content: [
          {
            type: "text",
            text: `Execution error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Get tool definitions for the specified tool names
   * Returns schemas that describe how to call these tools
   */
  private getToolDefinitions(toolNames: string[]): CallToolResult {
    const definitions: Array<{ name: string; schema: unknown }> = [];
    const notFound: string[] = [];

    for (const toolName of toolNames) {
      const toolDetail = this.toolNameToDetailList.find(
        ([name]) => name === toolName,
      );

      if (toolDetail) {
        definitions.push({
          name: toolDetail[0],
          schema: toolDetail[1],
        });
      } else {
        notFound.push(toolName);
      }
    }

    let text = "";

    if (definitions.length > 0) {
      text += "<tool_definitions>\n";
      for (const { name, schema } of definitions) {
        text += `<tool name="${name}">\n${
          JSON.stringify(
            schema,
            null,
            2,
          )
        }\n</tool>\n`;
      }
      text += "</tool_definitions>\n";
    }

    if (notFound.length > 0) {
      text += `<not_found>${notFound.join(", ")}</not_found>\n`;
      this.logger.warning({
        message: "Some tools not found",
        notFound,
      });
    }

    return {
      content: [
        {
          type: "text",
          text: text || "No tool definitions found",
        },
      ],
      isError: notFound.length > 0 && definitions.length === 0,
    };
  }
}
