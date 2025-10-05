/**
 * MCP Sampling Provider - AI SDK LanguageModelV2 implementation
 */

import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2Prompt,
  LanguageModelV2StreamPart,
  LanguageModelV2Text,
  LanguageModelV2Usage,
} from "@ai-sdk/provider";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { SamplingMessage } from "@modelcontextprotocol/sdk/types.js";

/**
 * Configuration for MCP Language Model
 */
export interface MCPSamplingLanguageModelConfig {
  server: Server;
  modelId: string;
  baseUrl?: string;
  headers?: Record<string, string>;
}

/**
 * MCP Language Model implementation of AI SDK's LanguageModelV2 interface
 *
 * This allows MCPC server's createMessage capability to be used through AI SDK's standard interface.
 * The model uses MCPC server's createMessage method under the hood.
 */
export class MCPSamplingLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = "v2" as const;
  readonly provider: string;
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  private server: Server;
  private baseUrl?: string;
  private headers?: Record<string, string>;

  constructor(config: MCPSamplingLanguageModelConfig) {
    this.server = config.server;
    this.modelId = config.modelId;
    this.provider = "mcp";
    this.baseUrl = config.baseUrl;
    this.headers = config.headers;
  }

  /**
   * Generate a response using MCP's createMessage capability
   */
  async doGenerate(options: LanguageModelV2CallOptions): Promise<{
    content: LanguageModelV2Content[];
    finishReason: LanguageModelV2FinishReason;
    usage: LanguageModelV2Usage;
    request?: {
      body?: string;
    };
    response?: {
      id?: string;
      timestamp?: Date;
      modelId?: string;
      headers?: Record<string, string>;
    };
    warnings: LanguageModelV2CallWarning[];
  }> {
    // Convert AI SDK messages to MCPC format
    const messages = this.convertMessages(options.prompt);

    // Extract system prompt from AI SDK messages
    let systemPrompt: string | undefined;

    for (const msg of options.prompt) {
      if (msg.role === "system") {
        // System messages have string content
        systemPrompt = msg.content;
        break; // Use first system message
      }
    }

    // Call MCPC server's createMessage method directly (like base-sampling-executor)
    const result = await this.server.createMessage({
      systemPrompt,
      messages,
      maxTokens: options.maxOutputTokens ?? 55_000,
    });

    // Extract text from result and build content array
    const content: LanguageModelV2Content[] = [];

    if (result.content.type === "text" && result.content.text) {
      const textContent: LanguageModelV2Text = {
        type: "text",
        text: result.content.text,
      };
      content.push(textContent);
    }

    const finishReason = this.mapStopReason(result.stopReason);

    return {
      content,
      finishReason,
      usage: {
        inputTokens: undefined,
        outputTokens: undefined,
        totalTokens: 0,
      },
      request: {
        body: JSON.stringify({ systemPrompt, messages }),
      },
      response: {
        modelId: result.model,
        headers: this.headers,
      },
      warnings: [],
    };
  }

  /**
   * Stream a response using MCP's createMessage capability
   * Note: MCP createMessage doesn't natively support streaming, so this
   * implementation returns the full result as chunks.
   */
  async doStream(options: LanguageModelV2CallOptions): Promise<{
    stream: ReadableStream<LanguageModelV2StreamPart>;
    request?: {
      body?: string;
    };
    warnings: LanguageModelV2CallWarning[];
  }> {
    // MCP createMessage doesn't support native streaming, so we generate
    // the full response and stream it as chunks
    const result = await this.doGenerate(options);

    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      start(controller) {
        // Send stream start
        controller.enqueue({
          type: "stream-start",
          warnings: result.warnings,
        });

        // Send content
        for (const part of result.content) {
          if (part.type === "text") {
            controller.enqueue({
              type: "text-delta",
              id: "text-1",
              delta: part.text,
            });
          }
        }

        // Send response metadata
        if (result.response?.modelId) {
          controller.enqueue({
            type: "response-metadata",
            modelId: result.response.modelId,
            ...(result.response.headers
              ? { headers: result.response.headers }
              : {}),
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
      request: result.request,
      warnings: result.warnings,
    };
  }

  /**
   * Convert AI SDK messages to MCP sampling format
   */
  private convertMessages(prompt: LanguageModelV2Prompt): SamplingMessage[] {
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

      // Convert content - extract text from text parts only
      const textParts = msg.content.filter((c) => c.type === "text");
      const textContent = textParts
        .map((c) => {
          if (c.type === "text") {
            return c.text;
          }
          return "";
        })
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
  private mapStopReason(stopReason?: string): LanguageModelV2FinishReason {
    switch (stopReason) {
      case "endTurn":
        return "stop";
      case "maxTokens":
        return "length";
      case "stopSequence":
        return "stop";
      default:
        return "unknown";
    }
  }
}
