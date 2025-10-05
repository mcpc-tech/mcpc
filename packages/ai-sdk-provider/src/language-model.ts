/**
 * MCP Language Model - AI SDK LanguageModelV1 implementation
 */

import type {
  LanguageModelV1,
  LanguageModelV1CallOptions,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1StreamPart,
} from "@ai-sdk/provider";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  CreateMessageResultSchema,
  type SamplingMessage,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * Configuration for MCP Language Model
 */
export interface MCPLanguageModelConfig {
  client: Client;
  modelId: string;
  baseUrl?: string;
  headers?: Record<string, string>;
}

/**
 * MCP Language Model implementation of AI SDK's LanguageModelV1 interface
 *
 * This allows MCP sampling to be used through AI SDK's standard interface.
 * The model uses MCP's createMessage (sampling) capability under the hood.
 */
export class MCPLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = "v1" as const;
  readonly provider: string;
  readonly modelId: string;
  readonly defaultObjectGenerationMode = "json" as const;

  private client: Client;
  private baseUrl?: string;
  private headers?: Record<string, string>;

  constructor(config: MCPLanguageModelConfig) {
    this.client = config.client;
    this.modelId = config.modelId;
    this.provider = "mcp";
    this.baseUrl = config.baseUrl;
    this.headers = config.headers;
  }

  /**
   * Generate a response using MCP sampling
   */
  async doGenerate(
    options: LanguageModelV1CallOptions,
  ): Promise<{
    text?: string;
    toolCalls?: Array<{
      toolCallType: "function";
      toolCallId: string;
      toolName: string;
      args: string;
    }>;
    finishReason: LanguageModelV1FinishReason;
    usage: {
      promptTokens: number;
      completionTokens: number;
    };
    rawCall: {
      rawPrompt: unknown;
      rawSettings: Record<string, unknown>;
    };
    rawResponse?: {
      headers?: Record<string, string>;
    };
    warnings?: LanguageModelV1CallWarning[];
    request?: {
      body?: string;
    };
    response?: {
      id?: string;
      timestamp?: Date;
      modelId?: string;
    };
  }> {
    // Convert AI SDK messages to MCP format
    const messages = this.convertMessages(options.prompt);

    // Extract system prompt from AI SDK messages
    const systemPromptParts: string[] = [];

    for (const msg of options.prompt) {
      if (msg.role === "system") {
        // System messages have string content
        systemPromptParts.push(msg.content);
      }
    }

    const systemPrompt = systemPromptParts.length > 0
      ? systemPromptParts.join("\n")
      : undefined;

    // Create MCP sampling request params
    const params = {
      messages: messages,
      maxTokens: options.maxTokens,
      ...(systemPrompt ? { systemPrompt } : {}),
      modelPreferences: {
        hints: [{
          name: this.modelId,
        }],
      },
    };

    // Call MCP sampling via client request
    const result = await this.client.request(
      {
        method: "sampling/createMessage",
        params: params,
      },
      CreateMessageResultSchema,
    );

    // Extract text from result
    const text = result.content.type === "text" ? result.content.text : "";
    const finishReason = this.mapStopReason(result.stopReason);

    return {
      text,
      finishReason,
      usage: {
        promptTokens: 0, // MCP doesn't provide token counts
        completionTokens: 0,
      },
      rawCall: {
        rawPrompt: params,
        rawSettings: {},
      },
      rawResponse: {
        headers: this.headers,
      },
    };
  }

  /**
   * Stream a response using MCP sampling
   * Note: MCP sampling doesn't natively support streaming, so this
   * implementation returns the full result as a single chunk.
   */
  async doStream(
    options: LanguageModelV1CallOptions,
  ): Promise<{
    stream: ReadableStream<LanguageModelV1StreamPart>;
    rawCall: {
      rawPrompt: unknown;
      rawSettings: Record<string, unknown>;
    };
    rawResponse?: {
      headers?: Record<string, string>;
    };
    warnings?: LanguageModelV1CallWarning[];
    request?: {
      body?: string;
    };
  }> {
    // MCP sampling doesn't support native streaming, so we generate
    // the full response and stream it as a single chunk
    const result = await this.doGenerate(options);

    const stream = new ReadableStream<LanguageModelV1StreamPart>({
      start(controller) {
        // Send the text as a delta
        if (result.text) {
          controller.enqueue({
            type: "text-delta",
            textDelta: result.text,
          });
        }

        // Send finish message
        controller.enqueue({
          type: "finish",
          finishReason: result.finishReason,
          usage: result.usage,
        });

        controller.close();
      },
    });

    return {
      stream,
      rawCall: result.rawCall,
      rawResponse: result.rawResponse,
      warnings: result.warnings,
    };
  }

  /**
   * Convert AI SDK messages to MCP format
   */
  private convertMessages(
    prompt: LanguageModelV1CallOptions["prompt"],
  ): SamplingMessage[] {
    const messages: SamplingMessage[] = [];

    for (const msg of prompt) {
      // Skip system messages - they're handled separately
      if (msg.role === "system") {
        continue;
      }

      // Convert role
      const role = msg.role === "user"
        ? ("user" as const)
        : msg.role === "assistant"
        ? ("assistant" as const)
        : ("user" as const); // fallback

      // Convert content
      const textContent = msg.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");

      if (textContent) {
        messages.push({
          role: role,
          content: {
            type: "text",
            text: textContent,
          },
        });
      }
    }

    return messages;
  }

  /**
   * Map MCP stop reason to AI SDK finish reason
   */
  private mapStopReason(
    stopReason?: string,
  ): LanguageModelV1FinishReason {
    switch (stopReason) {
      case "endTurn":
        return "stop";
      case "maxTokens":
        return "length";
      case "stopSequence":
        return "stop";
      default:
        return "stop";
    }
  }
}
