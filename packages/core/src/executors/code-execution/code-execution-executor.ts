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
    const executeSpan: Span | null = this.tracingEnabled
      ? startSpan("mcpc.code_execution_execute", {
        agent: this.name,
        action: String(args.action ?? "unknown"),
        decision: String(args.decision ?? "proceed"),
      }, parentSpan ?? undefined)
      : null;

    try {
      // Validate input
      const validationResult = await Promise.resolve(
        this.validate(args, schema),
      );
      if (!validationResult.valid) {
        if (executeSpan) {
          executeSpan.setAttributes({
            validationError: true,
            errorMessage: validationResult.error || "Validation failed",
          });
          endSpan(executeSpan);
        }

        return {
          content: [{
            type: "text",
            text: CompiledPrompts.errorResponse({
              errorMessage: validationResult.error || "Validation failed",
            }),
          }],
          isError: true,
        };
      }

      const action = args.action as string;
      const decision = args.decision as string;

      if (executeSpan) {
        executeSpan.setAttribute("action", action);
      }

      // Handle completion
      if (decision === "complete") {
        if (executeSpan) {
          executeSpan.setAttribute("completed", true);
          endSpan(executeSpan);
        }

        this.logger.info({
          message: "Code execution completed",
          agent: this.name,
        });

        return {
          content: [{
            type: "text",
            text: CompiledPrompts.completionMessage(),
          }],
        };
      }

      // Route to appropriate handler
      let result: CallToolResult;

      switch (action) {
        case "search_tools":
          result = this.handleSearchTools(args, executeSpan);
          break;

        case "execute_code":
          result = await this.handleExecuteCode(args, executeSpan);
          break;

        default:
          result = {
            content: [{
              type: "text",
              text:
                `Unknown action: ${action}. Available actions: search_tools, execute_code`,
            }],
            isError: true,
          };
      }

      if (executeSpan) {
        endSpan(executeSpan);
      }

      return result;
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
        content: [{
          type: "text",
          text: `Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        }],
        isError: true,
      };
    }
  }

  /**
   * Search for tools and return their full schemas
   */
  private handleSearchTools(
    args: Record<string, unknown>,
    span?: Span | null,
  ): CallToolResult {
    const keyword = String(args.keyword || "").toLowerCase();

    if (span) {
      span.setAttribute("keyword", keyword);
    }

    // Empty keyword = list all tools
    const matchingTools = keyword
      ? this.toolNameToDetailList.filter(([name, tool]) => {
        const toolName = name.toLowerCase();
        const toolDesc =
          (tool as { description?: string }).description?.toLowerCase() || "";
        return toolName.includes(keyword) || toolDesc.includes(keyword);
      })
      : this.toolNameToDetailList;

    // Always return full schemas
    const output = `Found ${matchingTools.length} tools:\n\n` +
      matchingTools.map(([name, tool]) =>
        `## ${name}\n${JSON.stringify(tool, null, 2)}`
      ).join("\n\n");

    this.logger.info({
      message: "Tool search",
      keyword: keyword || "(all)",
      matches: matchingTools.length,
    });

    return {
      content: [{
        type: "text",
        text: output,
      }],
    };
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
        content: [{
          type: "text",
          text: "Error: No code provided",
        }],
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
            args.map((a) => {
              // Stringify objects for better readability
              if (typeof a === "object" && a !== null) {
                return JSON.stringify(a, null, 2);
              }
              return String(a);
            }).join(" "),
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
      ].filter(Boolean).join("\n");

      return {
        content: [{
          type: "text",
          text: output || "Code executed successfully (no output)",
        }],
      };
    } catch (error) {
      this.logger.error({
        message: "Code execution failed",
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        content: [{
          type: "text",
          text: `Execution error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        }],
        isError: true,
      };
    }
  }

  /**
   * Validate input arguments against schema
   */
  private validate(
    args: Record<string, unknown>,
    schema: Record<string, unknown>,
  ): { valid: boolean; error?: string } {
    try {
      const validate = ajv.compile(schema);
      const valid = validate(args);

      if (!valid && validate.errors) {
        const aggregatedError = new AggregateAjvError(validate.errors);
        return {
          valid: false,
          error: aggregatedError.message,
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
