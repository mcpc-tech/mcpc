/**
 * Base AI Executor - Abstract class for AI SDK-based executors
 */

import type { LanguageModelV2 } from "@ai-sdk/provider";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Span, Tracer } from "@opentelemetry/api";
import { trace } from "@opentelemetry/api";
import { streamText, tool, stepCountIs, jsonSchema } from "ai";
import type { Tool } from "ai";
import { createLogger, type MCPLogger } from "../../utils/logger.ts";
import type { ComposableMCPServer } from "../../compose.ts";

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
  userRequest: string;
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
    return this.tracer.startActiveSpan(`mcpc.ai.${this.config.name}`, async (span: Span) => {
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
    });
  }

  private async executeCore(args: ExecuteArgs, span?: Span): Promise<CallToolResult> {
    try {
      const result = streamText({
        model: this.getModel(),
        system: this.buildSystemPrompt(args),
        messages: [{ role: "user", content: args.userRequest }],
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

      this.logger.error({ steps: await result.steps });

      return {
        content: [
          {
            type: "text",
            text:
              (await result.text) ||
              `Completed in ${(await result.steps)?.length ?? "unknown"} step(s).`,
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
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  protected buildSystemPrompt(args: ExecuteArgs): string {
    let prompt = `You are ${this.config.name}: ${this.config.description}\n`;
    if (args.context) {
      prompt += `\nContext: ${JSON.stringify(args.context, null, 2)}\n`;
    }
    prompt += `\nUse tools to complete the task. Summarize when done.`;
    return prompt;
  }

  protected convertToAISDKTool(
    name: string,
    toolDetail: ExternalTool,
    execute: (input: Record<string, unknown>) => Promise<unknown>,
  ): Tool<any, any> {
    return tool({
      description: toolDetail.description || `Tool: ${name}`,
      inputSchema: jsonSchema((toolDetail.inputSchema as any) || { type: "object" }),
      execute,
    });
  }
}
