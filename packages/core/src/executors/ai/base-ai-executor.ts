/**
 * Base AI Executor - Abstract class for AI SDK-based executors
 */

import type { LanguageModelV2 } from "@ai-sdk/provider";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Span, Tracer } from "@opentelemetry/api";
import { trace } from "@opentelemetry/api";
import { jsonSchema, stepCountIs, streamText, tool } from "ai";
import type { Tool } from "ai";
import { createLogger, type MCPLogger } from "../../utils/logger.ts";
import type { ComposableMCPServer } from "../../compose.ts";
import { cleanToolSchema } from "../../utils/common/provider.ts";

export interface ExternalTool {
  inputSchema?: Record<string, unknown>;
  description?: string;
  execute?: (args: Record<string, unknown>) => Promise<CallToolResult>;
}

export interface AIExecutorConfig {
  name: string;
  description: string;
  maxSteps?: number;
  tracingEnabled?: boolean;
}

export interface ExecuteArgs {
  prompt: string;
  context?: Record<string, unknown>;
}

/**
 * Abstract base class for AI SDK-based executors.
 * Uses streamText with stopWhen for agentic loop control.
 */
export abstract class BaseAIExecutor {
  protected config: Required<AIExecutorConfig>;
  protected tracer: Tracer;
  protected logger: MCPLogger;

  constructor(config: AIExecutorConfig, server?: ComposableMCPServer) {
    this.config = {
      maxSteps: 50,
      tracingEnabled: true,
      ...config,
    };
    this.tracer = trace.getTracer(`mcpc.ai.${config.name}`);
    this.logger = createLogger(`mcpc.ai.${config.name}`, server);
  }

  protected abstract getModel(): LanguageModelV2;
  protected abstract getExecutorType(): "mcp" | "acp";
  protected abstract buildTools(): Record<string, Tool<any, any>>;

  execute(args: ExecuteArgs): Promise<CallToolResult> {
    if (this.config.tracingEnabled) {
      return this.executeWithTracing(args);
    }
    return this.executeCore(args);
  }

  private executeWithTracing(args: ExecuteArgs): Promise<CallToolResult> {
    return this.tracer.startActiveSpan(
      `mcpc.ai.${this.config.name}`,
      async (span: Span) => {
        try {
          span.setAttributes({
            "mcpc.executor": this.config.name,
            "mcpc.type": this.getExecutorType(),
          });
          const result = await this.executeCore(args, span);
          span.setAttributes({ "mcpc.error": !!result.isError });
          return result;
        } catch (error) {
          span.recordException(error as Error);
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }

  private async executeCore(
    args: ExecuteArgs,
    span?: Span,
  ): Promise<CallToolResult> {
    try {
      const result = streamText({
        model: this.getModel(),
        system: this.buildSystemPrompt(args),
        messages: [{ role: "user", content: args.prompt }],
        tools: this.buildTools(),
        stopWhen: stepCountIs(this.config.maxSteps),
        experimental_telemetry: this.config.tracingEnabled
          ? {
            isEnabled: true,
            functionId: `mcpc.${this.config.name}`,
            tracer: this.tracer,
          }
          : undefined,
        onStepFinish: (step) => {
          if (span) {
            span.addEvent("step", {
              tools: step.toolCalls?.length ?? 0,
              reason: step.finishReason ?? "",
            });
          }
        },
      });

      return {
        content: [
          {
            type: "text",
            text: (await result.text) ||
              `Completed in ${
                (await result.steps)?.length ?? "unknown"
              } step(s).`,
          },
        ],
        isError: false,
      };
    } catch (error) {
      this.logger.error({ message: "Execution error", error });
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

  protected buildSystemPrompt(args: ExecuteArgs): string {
    return `Agent \`${this.config.name}\` that completes tasks by calling tools.

<manual>
${this.config.description}
</manual>

<rules>
${this.getRules()}
</rules>

<tools>
${this.getToolListDescription()}
</tools>${args.context ? this.formatContext(args.context) : ""}`;
  }

  protected getRules(): string {
    return `1. Use tools to complete the user's request
2. Review results after each tool call
3. Adapt your approach based on outcomes
4. Continue until task is complete
5. When complete, provide a summary WITHOUT calling more tools`;
  }

  protected getToolListDescription(): string {
    // Override in subclasses to provide specific tool list
    return "Tools will be provided by AI SDK";
  }

  protected formatContext(context: Record<string, unknown>): string {
    return `

<context>
${JSON.stringify(context, null, 2)}
</context>`;
  }

  protected convertToAISDKTool(
    name: string,
    toolDetail: ExternalTool,
    execute: (input: Record<string, unknown>) => Promise<unknown>,
  ): Tool<any, any> {
    // Clean the schema to remove internal/metadata fields like $schema
    const cleanedSchema = toolDetail.inputSchema
      ? cleanToolSchema(toolDetail.inputSchema)
      : { type: "object" };

    return tool({
      description: toolDetail.description || `Tool: ${name}`,
      inputSchema: jsonSchema(cleanedSchema as any),
      execute,
    });
  }
}
