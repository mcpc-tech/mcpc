import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ComposableMCPServer } from "../../compose.ts";
import type { SamplingConfig } from "../../types.ts";
import { CompiledPrompts } from "../../prompts/index.ts";
import { Ajv } from "ajv";
import { AggregateAjvError } from "@segment/ajv-human-errors";
import addFormats from "ajv-formats";
import { parseJSON } from "../../utils/common/json.ts";
import { inspect } from "node:util";

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
  }

  protected async runSamplingLoop<TState>(
    systemPrompt: () => string,
    schema: Record<string, unknown>,
    state?: TState,
  ) {
    // Initialize conversation
    this.conversationHistory = [];

    try {
      for (
        this.currentIteration = 0;
        this.currentIteration < this.maxIterations;
        this.currentIteration++
      ) {
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
          this.addParsingErrorToHistory(responseContent, parseError);
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

        if (result.isError) {
          // If processing resulted in an error, add to conversation history
          this.conversationHistory.push({
            role: "user",
            content: {
              type: "text",
              text: result.content[0].text as string,
            },
          });
          continue;
        }

        if (result.isComplete) {
          return result;
        }
      }

      // Reached maximum iterations
      return this.createMaxIterationsError();
    } catch (error) {
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
    // Optional: Log iteration progress for debugging
    console.log(
      `Iteration ${this.currentIteration + 1}/${this.maxIterations}:`,
      {
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
      },
    );
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
