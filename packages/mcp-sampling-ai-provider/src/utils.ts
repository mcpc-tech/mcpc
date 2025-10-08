/**
 * Shared utilities for MCP sampling
 *
 * Common functions used by both the provider and custom handler implementations.
 */

import type {
  CreateMessageRequest,
  SamplingMessage,
} from "@modelcontextprotocol/sdk/types.js";
import type {
  LanguageModelV2FinishReason,
  LanguageModelV2Prompt,
} from "@ai-sdk/provider";
import type { CoreMessage } from "ai";

/**
 * AI SDK compatible message format
 * Re-export CoreMessage from AI SDK for convenience
 */
export type AISDKMessage = CoreMessage;

/**
 * Convert MCP message format to AI SDK compatible format
 */
export function convertMCPMessagesToAISDK(
  messages: CreateMessageRequest["params"]["messages"],
): AISDKMessage[] {
  return messages.map((msg): CoreMessage => {
    const role = msg.role as "user" | "assistant";

    if (msg.content.type === "text") {
      return {
        role,
        content: msg.content.text,
      } as CoreMessage;
    } else if (msg.content.type === "image") {
      return {
        role,
        content: [
          {
            type: "image" as const,
            image: `data:${msg.content.mimeType};base64,${msg.content.data}`,
          },
        ],
      } as CoreMessage;
    } else {
      // Handle other types (audio, resource, etc.)
      return {
        role,
        content: [
          {
            type: "text" as const,
            text: `[${msg.content.type} content not supported]`,
          },
        ],
      } as CoreMessage;
    }
  });
}

/**
 * Convert AI SDK messages to MCP sampling format
 *
 * @param prompt - AI SDK format prompt
 * @returns MCP format messages
 */
export function convertAISDKToMCPMessages(
  prompt: LanguageModelV2Prompt,
): SamplingMessage[] {
  const messages: SamplingMessage[] = [];

  for (const msg of prompt) {
    if (msg.role === "system") continue; // System handled separately

    const role = msg.role === "assistant" ? "assistant" : "user";

    // Extract different content types
    const textParts = msg.content.filter((c) => c.type === "text");
    const toolCalls = msg.content.filter((c) => c.type === "tool-call");
    const toolResults = msg.content.filter((c) => c.type === "tool-result");

    // Format each type as plain text
    const parts: string[] = [];

    if (textParts.length > 0) {
      parts.push(textParts.map((c) => (c as any).text).join("\n"));
    }

    if (toolCalls.length > 0) {
      const calls = toolCalls.map((c) => {
        const call = c as any;
        return `<use_tool tool="${call.toolName}">\n${
          JSON.stringify(call.input || {})
        }\n</use_tool>`;
      });
      parts.push(calls.join("\n"));
    }

    if (toolResults.length > 0) {
      const results = toolResults.map((c) => {
        const result = c as any;
        const output = JSON.stringify(
          result.output || result.result || "undefined",
        );
        return `Tool "${result.toolName}" result:\n${output}`;
      });
      parts.push(results.join("\n\n"));
    }

    const text = parts.join("\n\n");
    if (text) {
      messages.push({ role, content: { type: "text", text } });
    }
  }

  return messages;
}

/**
 * Convert AI SDK finish reason to MCP stop reason
 *
 * @param finishReason - AI SDK finish reason
 * @returns MCP stop reason
 */
export function convertAISDKFinishReasonToMCP(
  finishReason?: string,
): "endTurn" | "stopSequence" | "maxTokens" {
  if (!finishReason || finishReason === "stop") {
    return "endTurn";
  }
  if (finishReason === "length") {
    return "maxTokens";
  }
  if (finishReason === "content-filter") {
    return "stopSequence";
  }
  // Default to endTurn for unknown reasons
  return "endTurn";
}

/**
 * Map MCP stop reason to AI SDK finish reason
 *
 * @param stopReason - MCP stop reason
 * @returns AI SDK finish reason
 */
export function convertMCPStopReasonToAISDK(
  stopReason?: string,
): LanguageModelV2FinishReason {
  if (stopReason === "endTurn" || stopReason === "stopSequence") {
    return "stop";
  }
  if (stopReason === "maxTokens") return "length";
  return (stopReason as LanguageModelV2FinishReason) ?? "unknown";
}
