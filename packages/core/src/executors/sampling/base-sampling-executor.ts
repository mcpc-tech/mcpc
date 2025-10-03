import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ComposableMCPServer } from "../../compose.ts";
import type { SamplingConfig } from "../../types.ts";
import { CompiledPrompts } from "../../prompts/index.ts";
import { Ajv } from "ajv";
import { AggregateAjvError } from "@segment/ajv-human-errors";
import addFormats from "ajv-formats";
import { parseJSON } from "@mcpc/utils";
import { inspect } from "node:util";
import { createLogger, type MCPLogger } from "../../utils/logger.ts";
import {
  endSpan,
  getTracer,
  initializeTracing,
  type Span,
  startSpan,
} from "../../utils/tracing.ts";

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
    // Create logger for this sampling executor
    this.logger = createLogger(`mcpc.sampling.${name}`, server);

    // Initialize tracing for sampling workflows
    // Check environment variable to enable tracing
    try {
      const tracingConfig = {
        enabled: Deno.env.get("MCPC_TRACING_ENABLED") === "true",
        serviceName: `mcpc-sampling-${name}`,
        exportTo: (Deno.env.get("MCPC_TRACING_EXPORT") || "console") as
          | "console"
          | "otlp"
          | "none",
        otlpEndpoint: Deno.env.get("MCPC_TRACING_OTLP_ENDPOINT"),
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
    // Initialize conversation
    this.conversationHistory = [];

    // Create a root span for the entire sampling loop
    const loopSpan = this.tracingEnabled
      ? startSpan("sampling_loop", {
        agent: this.name,
        maxIterations: this.maxIterations,
      })
      : null;

    try {
      for (
        this.currentIteration = 0;
        this.currentIteration < this.maxIterations;
        this.currentIteration++
      ) {
        // Create a span for each iteration
        const iterationSpan = this.tracingEnabled
          ? startSpan("sampling_iteration", {
            iteration: this.currentIteration + 1,
            agent: this.name,
          })
          : null;

        try {
          const response = await this.server.createMessage({
            systemPrompt: systemPrompt(),
            messages: this.conversationHistory,
            maxTokens: Number.MAX_SAFE_INTEGER,
          });

          const responseContent = (response.content.text as string) || "{}";

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

          // Process the parsed data using subclass implementation
          const result = await this.processAction(parsedData, schema, state);
          this.logIterationProgress(parsedData, result);

          if (iterationSpan) {
            iterationSpan.setAttributes({
              isError: result.isError ?? false,
              isComplete: result.isComplete ?? false,
            });
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
      return this.createMaxIterationsError();
    } catch (error) {
      if (loopSpan) endSpan(loopSpan, error as Error);
      return this.createExecutionError(error);
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

  protected createMaxIterationsError(): CallToolResult {
    const result = this.createCompletionResult(
      `Action argument validation failed: Execution reached maximum iterations (${this.maxIterations}). Please try with a more specific request or break down the task into smaller parts.`,
    );
    return {
      ...result,
      isError: true,
      isComplete: false,
    };
  }

  protected createExecutionError(error: unknown): CallToolResult {
    const errorMessage = `Sampling execution error: ${
      error instanceof Error ? error.message : String(error)
    }`;
    const result = this.createCompletionResult(errorMessage);
    return {
      ...result,
      isError: true,
      isComplete: false,
    };
  }

  protected createCompletionResult(text: string): CallToolResult {
    const conversationDetails = this.getConversationDetails();

    return {
      content: [
        {
          type: "text",
          text: `Task Completed
${text}
**Execution Summary:**
- Iterations used: ${this.currentIteration + 1}/${this.maxIterations}
- Agent: ${this.name}${conversationDetails}`,
        },
      ],
      isError: false,
      isComplete: true,
    };
  }

  protected getConversationDetails(): string {
    if (this.conversationHistory.length === 0) {
      return "\n\n**No conversation history available**";
    }

    let details = "\n\n**Detailed Conversation History:**";

    this.conversationHistory.forEach((message) => {
      if (message.role === "assistant") {
        // Try to parse JSON and format nicely
        try {
          const parsed = JSON.parse(message.content.text);
          details += "\n```json\n" + JSON.stringify(parsed, null, 2) + "\n```";
        } catch {
          // Not JSON, show as text
          details += "\n```\n" + message.content.text + "\n```";
        }
      } else {
        // User message
        details += "\n```\n" + message.content.text + "\n```";
      }
    });

    return details;
  }

  protected logIterationProgress(
    parsedData: Record<string, unknown>,
    result: CallToolResult,
  ): void {
    // Log iteration progress using MCP logging
    this.logger.debug({
      iteration: `${this.currentIteration + 1}/${this.maxIterations}`,
      parsedData,
      isError: result.isError,
      isComplete: result.isComplete,
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
