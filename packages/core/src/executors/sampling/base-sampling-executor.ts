import type {
  CallToolResult,
  CreateMessageResult,
  CreateMessageResultWithTools,
  SamplingMessage,
  TextContent,
  Tool,
  ToolResultContent,
} from "@modelcontextprotocol/sdk/types.js";
import type { ComposableMCPServer } from "../../compose.ts";
import type { SamplingConfig } from "../../types.ts";
import { parseJSON } from "@mcpc/utils";
import process from "node:process";
import { createLogger, type MCPLogger } from "../../utils/logger.ts";
import { validateSchema } from "../../utils/schema-validator.ts";
import type { Span } from "@opentelemetry/api";
import { endSpan, initializeTracing, startSpan } from "../../utils/tracing.ts";
import {
  cleanToolSchema,
  createModelCompatibleJSONSchema,
} from "../../utils/common/provider.ts";

export interface ExternalTool {
  inputSchema?: Record<string, unknown>;
  description?: string;
}

export abstract class BaseSamplingExecutor {
  protected conversationHistory: SamplingMessage[] = [];
  protected maxIterations: number = 55;
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

    // Initialize tracing for sampling executions
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

  /**
   * Convert toolNameToDetailList to MCP Tool format for sampling
   */
  protected convertToMcpTools(): Tool[] {
    return this.toolNameToDetailList.map(([name, detail]) => ({
      name,
      description: detail.description || `Tool: ${name}`,
      inputSchema: {
        type: "object" as const,
        // Clean the schema to remove internal/metadata fields like $schema
        ...cleanToolSchema(detail.inputSchema || {}),
      },
    }));
  }

  /**
   * Check if client supports sampling with tools
   */
  protected supportsSamplingTools(): boolean {
    const capabilities = this.server.getClientCapabilities();
    return !!capabilities?.sampling?.tools;
  }

  /**
   * Check if response contains tool use
   */
  protected isToolUseResponse(
    response: CreateMessageResult | CreateMessageResultWithTools,
  ): boolean {
    if (!response.content) return false;

    const content = Array.isArray(response.content)
      ? response.content
      : [response.content];

    return content.some((block) => block.type === "tool_use");
  }

  /**
   * Extract tool calls from response
   */
  protected extractToolCalls(
    response: CreateMessageResult | CreateMessageResultWithTools,
  ): Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
  }> {
    if (!response.content) return [];

    const content = Array.isArray(response.content)
      ? response.content
      : [response.content];

    return content
      .filter((block) => block.type === "tool_use")
      .map((block) => (
        "id" in block && "name" in block && "input" in block
          ? {
            id: block.id as string,
            name: block.name as string,
            input: (block.input as Record<string, unknown>) || {},
          }
          : { id: "", name: "", input: {} }
      ));
  }

  protected async runSamplingLoop<TState>(
    systemPrompt: () => string,
    schema: Record<string, unknown>,
    state?: TState,
  ) {
    // Check if client supports tool use in sampling
    const useTools = this.supportsSamplingTools();

    this.logger.debug({
      message: "Sampling mode determined",
      useTools,
      mode: useTools ? "native_tools" : "json_fallback",
    });

    // Initialize conversation based on mode

    this.conversationHistory = [
      {
        // Failed: 400 {"error":{"message":"messages: at least one message is required","code":"invalid_request_body"}}
        role: "user",
        content: {
          type: "text",
          text: `start`,
        },
      },
    ];

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
        let iterationSpan: Span | null = null;

        try {
          // Build createMessage params based on mode
          let createMessageParams;

          if (useTools) {
            createMessageParams = {
              systemPrompt: systemPrompt(),
              messages: this.conversationHistory,
              maxTokens: 55_000,
              tools: this.convertToMcpTools(),
              toolChoice: { mode: "auto" as const },
            };
          } else {
            createMessageParams = {
              systemPrompt: systemPrompt(),
              messages: this.conversationHistory,
              maxTokens: 55_000,
            };
          }

          const response = await this.server.createMessage(createMessageParams);

          const model = response.model;
          const stopReason = response.stopReason;
          const role = response.role;

          // Handle response based on mode
          if (useTools && this.isToolUseResponse(response)) {
            // Tool mode: handle tool calls
            const toolCalls = this.extractToolCalls(response);

            if (toolCalls.length === 0) {
              // No tool calls but using tool mode - might be completion
              const contentArray = Array.isArray(response.content)
                ? response.content
                : [response.content];
              const textBlock = contentArray.find((c) => c.type === "text");
              const textContent = textBlock && "text" in textBlock
                ? textBlock.text
                : undefined;

              if (textContent) {
                // Natural completion with text response
                return await this.createCompletionResult(
                  textContent,
                  loopSpan,
                );
              }
              continue;
            }

            // Execute tool calls and add results to history
            iterationSpan = this.tracingEnabled
              ? startSpan(
                "mcpc.sampling_iteration.tool_use",
                {
                  iteration: this.currentIteration + 1,
                  agent: this.name,
                  toolCalls: toolCalls.length,
                  maxIterations: this.maxIterations,
                },
                loopSpan ?? undefined,
              )
              : null;

            // Add assistant's tool call to history
            this.conversationHistory.push({
              role: "assistant",
              content: response.content,
            });

            // Execute each tool and collect results
            const toolResults: ToolResultContent[] = [];
            for (const toolCall of toolCalls) {
              try {
                const result = await this.server.callTool(
                  toolCall.name,
                  toolCall.input,
                ) as CallToolResult;
                toolResults.push({
                  type: "tool_result",
                  toolUseId: toolCall.id,
                  content: result.content || [],
                  isError: result.isError,
                } as ToolResultContent);
              } catch (error) {
                toolResults.push({
                  type: "tool_result",
                  toolUseId: toolCall.id,
                  content: [{
                    type: "text",
                    text: `Error: ${
                      error instanceof Error ? error.message : String(error)
                    }`,
                  }],
                  isError: true,
                } as ToolResultContent);
              }
            }

            // Add tool results to history
            this.conversationHistory.push({
              role: "user",
              content: toolResults,
            });

            if (iterationSpan) {
              iterationSpan.setAttributes({
                toolExecutions: toolResults.length,
                hasErrors: toolResults.some((r) => r.isError),
              });
              endSpan(iterationSpan);
            }

            // Continue to next iteration for LLM to process results
            continue;
          }

          // JSON fallback mode: parse and validate JSON response
          const content = Array.isArray(response.content)
            ? response.content
            : [response.content];
          const textContent = content.find((c) => c.type === "text") as
            | TextContent
            | undefined;
          const responseContent = (textContent?.text as string) || "{}";

          let parsedData: Record<string, unknown>;
          try {
            parsedData = parseJSON(responseContent.trim(), true);
          } catch (parseError) {
            // Create span for parse error iteration
            iterationSpan = this.tracingEnabled
              ? startSpan(
                "mcpc.sampling_iteration.parse_error",
                {
                  iteration: this.currentIteration + 1,
                  agent: this.name,
                  error: String(parseError),
                  maxIterations: this.maxIterations,
                },
                loopSpan ?? undefined,
              )
              : null;

            this.addParsingErrorToHistory(responseContent, parseError);
            if (iterationSpan) endSpan(iterationSpan);
            continue;
          }

          // Always show LLM what we parsed - this allows self-correction
          this.conversationHistory.push({
            role: "assistant",
            content: {
              type: "text",
              text: JSON.stringify(parsedData, null, 2),
            },
          });

          // Create span name from parsed data
          const decision = parsedData["decision"];
          const useTool = parsedData["useTool"];
          const actionStr = decision === "complete"
            ? "completion"
            : (useTool && typeof useTool === "string"
              ? String(useTool)
              : "unknown_action");
          const spanName = `mcpc.sampling_iteration.${actionStr}`;

          iterationSpan = this.tracingEnabled
            ? startSpan(
              spanName,
              {
                iteration: this.currentIteration + 1,
                agent: this.name,
                action: actionStr,
                systemPrompt: systemPrompt(),
                maxTokens: String(Number.MAX_SAFE_INTEGER),
                maxIterations: this.maxIterations,
                messages: JSON.stringify(this.conversationHistory),
              },
              loopSpan ?? undefined,
            )
            : null;

          // Process the parsed data using subclass implementation
          const result = await this.processAction(
            parsedData,
            schema,
            state,
            iterationSpan,
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
              action: typeof useTool === "string" ? useTool : String(useTool),
              decision: typeof decision === "string"
                ? decision
                : String(decision),
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
            const errorText = result.content?.[0] && "text" in result.content[0]
              ? result.content[0].text as string
              : "Unknown error";
            this.conversationHistory.push({
              role: "user",
              content: {
                type: "text",
                text: errorText,
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
    _responseText: string,
    parseError: unknown,
  ): void {
    const errorMsg = parseError instanceof Error
      ? parseError.message
      : String(parseError);

    this.conversationHistory.push({
      role: "user",
      content: {
        type: "text",
        text: `Invalid JSON: ${errorMsg}\n\nRespond with valid JSON.`,
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
          const contentArray = Array.isArray(msg.content)
            ? msg.content
            : [msg.content];
          const textBlock = contentArray.find((c) => c.type === "text") as
            | TextContent
            | undefined;
          const text = textBlock?.text || "(No text content)";
          return `${prefix}:\n${text}`;
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

      const summaryContent = Array.isArray(response.content)
        ? response.content.find((c) => c.type === "text") as
          | TextContent
          | undefined
        : response.content as TextContent | undefined;
      const summary = "\n\n" +
        (summaryContent?.text as string || "No summary available");

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

      // Extract text from content (which can be array or single block)
      const contentArray = Array.isArray(msg.content)
        ? msg.content
        : [msg.content];
      const textBlock = contentArray.find((c) => c.type === "text") as
        | TextContent
        | undefined;
      const contentText = textBlock?.text;

      if (!contentText) {
        return `${header}\\n(No text content)`;
      }

      try {
        const parsed = JSON.parse(contentText);
        // For parsed JSON, show compact single-line for short content
        if (JSON.stringify(parsed).length < 100) {
          return `${header}\\n${JSON.stringify(parsed)}`;
        }
        return `${header}\\n\`\`\`json\\n${
          JSON.stringify(
            parsed,
            null,
            2,
          )
        }\\n\`\`\``;
      } catch {
        return `${header}\\n${contentText}`;
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
      result,
    });
  }

  // Abstract methods that subclasses must implement
  protected abstract processAction<TState>(
    parsedData: Record<string, unknown>,
    schema: Record<string, unknown>,
    state?: TState,
    parentSpan?: Span | null,
  ): Promise<CallToolResult>;

  protected formatPromptForMode({
    prompt,
    schema,
    schemaPrefix = "JSON schema:",
    schemaSuffix = `STRICT REQUIREMENTS:
1. Return ONE AND ONLY ONE raw JSON object that passes JSON.parse() - no markdown, code blocks, explanatory text, or multiple JSON objects
2. Include ALL required fields with correct data types and satisfy ALL schema constraints (anyOf, oneOf, allOf, not, enum, pattern, min/max, conditionals)
3. Your response must be a single JSON object, nothing else

INVALID: \`\`\`json{"key":"value"}\`\`\` or "Here is: {"key":"value"}" or {"key":"value"}{"key":"value"}
VALID: {"key":"value"}`,
  }: {
    prompt?: string;
    schema?: Record<string, unknown>;
    schemaPrefix?: string;
    schemaSuffix?: string;
  }): string {
    // If using native tools mode, return just the prompt without JSON instructions
    if (this.supportsSamplingTools()) {
      return prompt && prompt.length > 0 ? prompt : "";
    }

    // JSON fallback mode: include schema and formatting instructions
    return [
      prompt != null && prompt.length > 0 ? prompt : undefined,
      prompt != null && prompt.length > 0 ? "" : undefined, // add a newline if prompt is not null
      schemaPrefix,
      schema != null
        ? JSON.stringify(createModelCompatibleJSONSchema(schema), null, 2)
        : undefined,
      schemaSuffix,
    ]
      .filter((line) => line != null)
      .join("\n");
  }

  // Validate arguments using JSON schema
  private validateInput(
    args: Record<string, unknown>,
    schema: Record<string, unknown>,
  ): {
    valid: boolean;
    error?: string;
  } {
    return validateSchema(args, schema);
  }
}
