import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ComposableMCPServer } from "../../compose.ts";
import type { SamplingConfig } from "../../types.ts";
import { CompiledPrompts } from "../../prompts/index.ts";
import { Ajv } from "ajv";
import { AggregateAjvError } from "@segment/ajv-human-errors";
import addFormats from "ajv-formats";
import { parseJSON } from "@mcpc/utils";
import { inspect } from "node:util";
import process from "node:process";
import { createLogger, type MCPLogger } from "../../utils/logger.ts";
import type { Span } from "@opentelemetry/api";
import { endSpan, initializeTracing, startSpan } from "../../utils/tracing.ts";

const ajv = new Ajv({
  allErrors: true,
  verbose: true,
});
// @ts-ignore -
addFormats(ajv);

export interface ConversationMessage {
  role: "user" | "assistant";
  content: {
    type: "text";
    text: string;
  };
  [x: string]: unknown;
}

export interface ResponseContent {
  type: string;
  text?: string;
}

export interface LLMResponse {
  content: ResponseContent[];
  stopReason?: string;
  model: string;
  role: "user" | "assistant";
}

export interface ExternalTool {
  inputSchema?: Record<string, unknown>;
  description?: string;
}

export abstract class BaseSamplingExecutor {
  protected conversationHistory: ConversationMessage[] = [];
  protected maxIterations: number = 33;
  protected currentIteration: number = 0;
  protected logger: MCPLogger;
  protected tracingEnabled: boolean = false;
  protected summarize: boolean = true;

  constructor(
    protected name: string,
    protected description: string,
    protected allToolNames: string[],
    protected toolNameToDetailList: [string, ExternalTool][],
    protected server: ComposableMCPServer,
    config?: SamplingConfig,
  ) {
    if (config?.maxIterations) {
      this.maxIterations = config.maxIterations;
    }
    if (config?.summarize !== undefined) {
      this.summarize = config.summarize;
    }
    // Create logger for this sampling executor
    this.logger = createLogger(`mcpc.sampling.${name}`, server);

    // Initialize tracing for sampling workflows
    try {
      const tracingConfig = {
        enabled: process.env.MCPC_TRACING_ENABLED === "true",
        serviceName: `mcpc-sampling-${name}`,
        exportTo: (process.env.MCPC_TRACING_EXPORT ?? "otlp") as
          | "console"
          | "otlp"
          | "none",
        otlpEndpoint: process.env.MCPC_TRACING_OTLP_ENDPOINT ??
          "http://localhost:4318/v1/traces",
      };
      this.tracingEnabled = tracingConfig.enabled;
      if (this.tracingEnabled) {
        initializeTracing(tracingConfig);
      }
    } catch {
      // Environment access may not be available in all runtimes
      this.tracingEnabled = false;
    }
  }

  protected async runSamplingLoop<TState>(
    systemPrompt: () => string,
    schema: Record<string, unknown>,
    state?: TState,
  ) {
    // Initialize conversation with an initial user message
    // Ensure at least one message (Claude requirement) and enforce JSON-only output
    this.conversationHistory = [{
      role: "user",
      content: {
        type: "text",
        text:
          'Return ONLY raw JSON (no code fences or explanations). The JSON MUST include action and decision. Example: {"action":"<tool>","decision":"proceed|complete","<tool>":{}}',
      },
    }];

    // Create a root span for the entire sampling loop
    const loopSpan: Span | null = this.tracingEnabled
      ? startSpan("mcpc.sampling_loop", {
        agent: this.name,
        maxIterations: this.maxIterations,
        systemPrompt: systemPrompt(),
      })
      : null;

    try {
      for (
        this.currentIteration = 0;
        this.currentIteration < this.maxIterations;
        this.currentIteration++
      ) {
        // Create a span for each iteration
        const iterationSpan: Span | null = this.tracingEnabled
          ? startSpan(
            "mcpc.sampling_iteration",
            {
              iteration: this.currentIteration + 1,
              agent: this.name,
              systemPrompt: systemPrompt(),
              maxTokens: String(Number.MAX_SAFE_INTEGER),
              maxIterations: this.maxIterations,
              messages: JSON.stringify(this.conversationHistory),
            },
            loopSpan ?? undefined,
          )
          : null;

        try {
          const response = await this.server.createMessage({
            systemPrompt: systemPrompt(),
            messages: this.conversationHistory,
            maxTokens: 55_000,
          });

          const responseContent = (response.content.text as string) || "{}";
          const model = response.model;
          const stopReason = response.stopReason;
          const role = response.role;

          // Parse JSON response
          let parsedData: Record<string, unknown>;
          try {
            parsedData = parseJSON(responseContent.trim(), true);
          } catch (parseError) {
            if (iterationSpan) {
              iterationSpan.addEvent("parse_error", {
                error: String(parseError),
              });
            }
            this.addParsingErrorToHistory(responseContent, parseError);
            if (iterationSpan) endSpan(iterationSpan);
            continue;
          }

          if (parsedData) {
            this.conversationHistory.push({
              role: "assistant",
              content: {
                type: "text",
                text: JSON.stringify(parsedData, null, 2),
              },
            });
          }

          const action = parsedData["action"];

          // If an action name is present, record it as an attribute on the iteration span for easier tracing/debugging.
          if (action && typeof action === "string") {
            // Update the span name to include the action for clearer traces.
            try {
              const safeAction = String(action).replace(/\s+/g, "_");
              // updateName is part of the OpenTelemetry Span API
              if (
                iterationSpan &&
                typeof (iterationSpan as any).updateName === "function"
              ) {
                (iterationSpan as any).updateName(
                  `mcpc.sampling_iteration.${safeAction}`,
                );
              }
            } catch {
              // Ignore any errors while updating span name
            }
          }

          // Minimal self-healing: ensure required fields exist
          if (!action || typeof parsedData["decision"] !== "string") {
            this.conversationHistory.push({
              role: "user",
              content: {
                type: "text",
                text:
                  'Required fields missing: action or decision. Return ONLY raw JSON, no code fences or explanations. Example: {"action":"<tool>","decision":"proceed|complete","<tool>":{}}',
              },
            });
            if (iterationSpan) endSpan(iterationSpan);
            continue;
          }

          // Process the parsed data using subclass implementation
          const result = await this.processAction(
            parsedData,
            schema,
            state,
            loopSpan,
          );
          this.logIterationProgress(
            parsedData,
            result,
            model,
            stopReason,
            role,
          );

          if (iterationSpan) {
            // Simplified: store full raw JSON, raw LLM response, and full tool result if present (no truncation)
            let rawJson = "{}";
            try {
              rawJson = parsedData ? JSON.stringify(parsedData) : "{}";
            } catch {
              /* ignore serialization errors */
            }
            const attr: Record<string, string | number | boolean> = {
              isError: !!result.isError,
              isComplete: !!result.isComplete,
              iteration: this.currentIteration + 1,
              maxIterations: this.maxIterations,
              parsed: rawJson,
              action: typeof action === "string" ? action : String(action),
              samplingResponse: responseContent,
              toolResult: JSON.stringify(result),
              model: model,
              role: role,
            };
            if (stopReason) {
              attr.stopReason = stopReason;
            }
            iterationSpan.setAttributes(attr);
          }

          if (result.isError) {
            // If processing resulted in an error, add to conversation history
            this.conversationHistory.push({
              role: "user",
              content: {
                type: "text",
                text: result.content[0].text as string,
              },
            });
            if (iterationSpan) endSpan(iterationSpan);
            continue;
          }

          if (result.isComplete) {
            if (iterationSpan) endSpan(iterationSpan);
            if (loopSpan) endSpan(loopSpan);
            return result;
          }

          if (iterationSpan) endSpan(iterationSpan);
        } catch (iterError) {
          if (iterationSpan) endSpan(iterationSpan, iterError as Error);
          throw iterError;
        }
      }

      // Reached maximum iterations
      if (loopSpan) endSpan(loopSpan);
      return await this.createMaxIterationsError(loopSpan);
    } catch (error) {
      if (loopSpan) endSpan(loopSpan, error as Error);
      return await this.createExecutionError(error, loopSpan);
    }
  }

  protected addParsingErrorToHistory(
    responseText: string,
    parseError: unknown,
  ): void {
    this.conversationHistory.push({
      role: "assistant",
      content: {
        type: "text",
        text: `JSON parsing failed. Response was: ${responseText}`,
      },
    });

    this.conversationHistory.push({
      role: "user",
      content: {
        type: "text",
        text: CompiledPrompts.errorResponse({
          errorMessage: `JSON parsing failed: ${
            parseError instanceof Error
              ? parseError.message
              : String(parseError)
          }\n\nPlease respond with valid JSON.`,
        }),
      },
    });
  }

  protected async createMaxIterationsError(
    parentSpan?: Span | null,
  ): Promise<CallToolResult> {
    const result = await this.createCompletionResult(
      `Reached max iterations (${this.maxIterations}). Try a more specific request.`,
      parentSpan,
    );
    result.isError = true;
    result.isComplete = false;
    return result;
  }

  protected async createExecutionError(
    error: unknown,
    parentSpan?: Span | null,
  ): Promise<CallToolResult> {
    const result = await this.createCompletionResult(
      `Execution error: ${
        error instanceof Error ? error.message : String(error)
      }`,
      parentSpan,
    );
    result.isError = true;
    result.isComplete = false;
    return result;
  }

  protected async createCompletionResult(
    text: string,
    parentSpan?: Span | null,
  ): Promise<CallToolResult> {
    const summary = this.summarize
      ? await this.summarizeConversation(parentSpan)
      : this.formatConversation();

    return {
      content: [
        {
          type: "text",
          text: `${text}

**Execution Summary:**
- Iterations used: ${this.currentIteration + 1}/${this.maxIterations}
- Agent: ${this.name}
${summary}`,
        },
      ],
      isError: false,
      isComplete: true,
    };
  }

  // Use LLM to create high-signal summary for parent agent
  protected async summarizeConversation(
    parentSpan?: Span | null,
  ): Promise<string> {
    if (this.conversationHistory.length === 0) {
      return "\n\n**No conversation history**";
    }

    // Short conversations don't need summarization
    if (this.conversationHistory.length <= 3) {
      return this.formatConversation();
    }

    const summarizeSpan = this.tracingEnabled
      ? startSpan(
        "mcpc.sampling_summarize",
        {
          agent: this.name,
          messageCount: this.conversationHistory.length,
        },
        parentSpan ?? undefined,
      )
      : null;

    try {
      this.logger.debug({
        message: "Starting conversation summarization",
        messageCount: this.conversationHistory.length,
      });

      const history = this.conversationHistory
        .map((msg, i) => {
          const prefix = `[${i + 1}] ${msg.role.toUpperCase()}`;
          return `${prefix}:\n${msg.content.text}`;
        })
        .join("\n\n---\n\n");

      const response = await this.server.createMessage({
        systemPrompt: `Summarize this agent execution:

Final Decision: (include complete JSON if present)
Key Findings: (most important)
Actions Taken: (high-level flow)
Errors/Warnings: (if any)

${history}`,
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: "Please provide a concise summary.",
          },
        }],
        maxTokens: 3000,
      });

      const summary = "\n\n" + (response.content.text as string);

      this.logger.debug({
        message: "Summarization completed",
        summaryLength: summary.length,
      });

      if (summarizeSpan) {
        summarizeSpan.setAttributes({
          summaryLength: summary.length,
          summary: summary,
          success: true,
        });
        endSpan(summarizeSpan);
      }

      return summary;
    } catch (error) {
      this.logger.warning({
        message: "Summarization failed, falling back to full history",
        error: String(error),
      });

      if (summarizeSpan) {
        endSpan(summarizeSpan, error as Error);
      }

      return this.formatConversation();
    }
  }

  // Format full conversation history (for debugging)
  protected formatConversation(): string {
    if (this.conversationHistory.length === 0) {
      return "\n\n**No conversation history**";
    }

    const messages = this.conversationHistory.map((msg, i) => {
      const header = `### Message ${i + 1}: ${msg.role}`;

      try {
        const parsed = JSON.parse(msg.content.text);
        // For parsed JSON, show compact single-line for short content
        if (JSON.stringify(parsed).length < 100) {
          return `${header}\n${JSON.stringify(parsed)}`;
        }
        return `${header}\n\`\`\`json\n${
          JSON.stringify(
            parsed,
            null,
            2,
          )
        }\n\`\`\``;
      } catch {
        return `${header}\n${msg.content.text}`;
      }
    });

    return "\n\n**Conversation History:**\n" + messages.join("\n\n");
  }

  protected logIterationProgress(
    parsedData: Record<string, unknown>,
    result: CallToolResult,
    model?: string,
    stopReason?: string,
    role?: string,
  ): void {
    // Log iteration progress using MCP logging
    this.logger.debug({
      iteration: `${this.currentIteration + 1}/${this.maxIterations}`,
      parsedData,
      isError: result.isError,
      isComplete: result.isComplete,
      model,
      stopReason,
      role,
      result: inspect(result, {
        depth: 5,
        maxArrayLength: 10,
        breakLength: 120,
        compact: true,
        maxStringLength: 120,
      }),
    });
  }

  // Abstract methods that subclasses must implement
  protected abstract processAction<TState>(
    parsedData: Record<string, unknown>,
    schema: Record<string, unknown>,
    state?: TState,
    parentSpan?: Span | null,
  ): Promise<CallToolResult>;

  protected injectJsonInstruction({
    prompt,
    schema,
    schemaPrefix = "JSON schema:",
    schemaSuffix = `STRICT REQUIREMENTS:
1. Return ONLY raw JSON that passes JSON.parse() - no markdown, code blocks, explanatory text, or extra characters
2. Include ALL required fields with correct data types and satisfy ALL schema constraints (anyOf, oneOf, allOf, not, enum, pattern, min/max, conditionals)
3. Your response must be the JSON object itself, nothing else

INVALID: \`\`\`json{"key":"value"}\`\`\` or "Here is: {"key":"value"}"
VALID: {"key":"value"}`,
  }: {
    prompt?: string;
    schema?: Record<string, unknown>;
    schemaPrefix?: string;
    schemaSuffix?: string;
  }): string {
    return [
      prompt != null && prompt.length > 0 ? prompt : undefined,
      prompt != null && prompt.length > 0 ? "" : undefined, // add a newline if prompt is not null
      schemaPrefix,
      schema != null ? JSON.stringify(schema, null, 2) : undefined,
      schemaSuffix,
    ]
      .filter((line) => line != null)
      .join("\n");
  }

  // Validate arguments using JSON schema
  protected validateSchema(
    args: Record<string, unknown>,
    schema: Record<string, unknown>,
  ): {
    valid: boolean;
    error?: string;
  } {
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
