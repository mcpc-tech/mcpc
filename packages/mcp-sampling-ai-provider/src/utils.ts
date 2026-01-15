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
import type { ModelMessage } from "ai";

/**
 * AI SDK compatible message format
 */
export type AISDKMessage = ModelMessage;

/**
 * Convert MCP message format to AI SDK compatible format
 */
export function convertMCPMessagesToAISDK(
  messages: CreateMessageRequest["params"]["messages"],
): AISDKMessage[] {
  // First pass: build a map of toolUseId -> toolName from tool_use messages
  const toolNameMap = new Map<string, string>();
  for (const msg of messages) {
    const content = msg.content;
    if (Array.isArray(content)) {
      for (const item of content) {
        if (item.type === "tool_use" && "id" in item && "name" in item) {
          toolNameMap.set(item.id as string, item.name as string);
        }
      }
    } else if (
      content.type === "tool_use" && "id" in content && "name" in content
    ) {
      toolNameMap.set(content.id as string, content.name as string);
    }
  }

  // Second pass: convert messages using the tool name map
  return messages.map((msg): ModelMessage => {
    const role = msg.role as "user" | "assistant";
    const content = msg.content;

    // Handle array content (multiple content blocks)
    if (Array.isArray(content)) {
      // Preserve all supported parts so tool loops can work.
      const parts = [];
      let hasToolResult = false;

      for (const item of content) {
        switch (item.type) {
          case "text":
            parts.push({ type: "text", text: (item as any).text ?? "" });
            break;
          case "image":
            parts.push({
              type: "image",
              image: `data:${(item as any).mimeType};base64,${
                (item as any).data
              }`,
            });
            break;
          case "tool_use":
            parts.push({
              type: "tool-call",
              toolCallId: (item as any).id,
              toolName: (item as any).name,
              // Some ecosystems use `args`, some use `input`.
              args: (item as any).input,
              input: (item as any).input,
            });
            break;
          case "tool_result": {
            hasToolResult = true;
            const toolUseId = (item as any).toolUseId ?? "";
            const toolName = toolNameMap.get(toolUseId) || "unknown_tool";
            parts.push({
              type: "tool-result",
              toolName,
              toolCallId: toolUseId,
              output: {
                type: "text",
                value: JSON.stringify((item as any).content),
              },
            });
            break;
          }
          default:
            parts.push({
              type: "text",
              text: `[${(item as any).type} content not supported]`,
            });
            break;
        }
      }

      // AI SDK expects tool results as role: "tool".
      const finalRole = hasToolResult ? ("tool" as const) : role;

      // If it's only a single text part, collapse to string for compatibility.
      if (!hasToolResult && parts.length === 1 && parts[0].type === "text") {
        return { role: finalRole, content: parts[0].text } as ModelMessage;
      }

      return { role: finalRole, content: parts } as ModelMessage;
    }

    // Handle single content object
    switch (content.type) {
      case "text":
        return {
          role,
          content: content.text,
        } as ModelMessage;

      case "image":
        return {
          role,
          content: [
            {
              type: "image" as const,
              image: `data:${content.mimeType};base64,${content.data}`,
            },
          ],
        } as ModelMessage;

      case "tool_use":
        return {
          role,
          content: [
            {
              type: "tool-call",
              toolCallId: content.id,
              toolName: content.name,
              input: content.input,
            },
          ],
        } as ModelMessage;

      case "tool_result": {
        const toolUseId = "toolUseId" in content ? content.toolUseId : "";
        const toolName = toolNameMap.get(toolUseId as string) || "unknown_tool";

        return {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolName: toolName,
              toolCallId: toolUseId as string,
              output: {
                type: "text",
                value: JSON.stringify((content as any).content),
              },
            },
          ],
        };
      }

      default:
        // Handle other types (audio, resource, etc.)
        return {
          role,
          content: [
            {
              type: "text" as const,
              text: `[${content.type} content not supported]`,
            },
          ],
        } as ModelMessage;
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
        const toolArgs = call.args ?? call.input ?? {};
        return `<use_tool tool="${call.toolName}">\n${
          JSON.stringify(toolArgs)
        }\n</use_tool>`;
      });
      parts.push(calls.join("\n"));
    }

    if (toolResults.length > 0) {
      const results = toolResults.map((c) => {
        const result = c as any;
        const resultValue = result.result ?? result.output ?? "undefined";
        const output = JSON.stringify(
          resultValue,
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

/**
 * Convert MCP tools to AI SDK tools format
 *
 * This is used in client sampling to convert tools from the MCP server's
 * createMessage request into AI SDK tool format that can be passed to generateText.
 *
 * Note: This function does NOT provide execute implementations because in client sampling,
 * tool execution happens on the MCP server side, not the client side. The client just
 * returns tool-call content blocks which the server will then execute.
 *
 * @param mcpTools - Array of MCP Tool definitions from server's createMessage request
 * @param helpers - AI SDK helper functions (tool and jsonSchema from "ai" package)
 * @returns AI SDK tools object or undefined if no tools
 *
 * @example
 * ```typescript
 * import { tool, jsonSchema, generateText } from "ai";
 * import { convertMCPToolsToAISDK } from "@mcpc/mcp-sampling-ai-provider";
 *
 * const aiTools = convertMCPToolsToAISDK(params.tools, { tool, jsonSchema });
 * const result = await generateText({
 *   model: modelId,
 *   messages: params.messages,
 *   tools: aiTools,  // Tools without execute - they're just for the LLM to know about
 * });
 * ```
 */
export function convertMCPToolsToAISDK(
  mcpTools?: CreateMessageRequest["params"]["tools"],
  helpers?: {
    tool: (...args: any[]) => any;
    jsonSchema: (...args: any[]) => any;
  },
): Record<string, any> | undefined {
  if (!mcpTools || mcpTools.length === 0) {
    return undefined;
  }

  // If helpers not provided, return simple format (for backward compatibility)
  if (!helpers) {
    const aiTools: Record<string, any> = {};
    for (const tool of mcpTools) {
      aiTools[tool.name] = {
        description: tool.description,
        parameters: tool.inputSchema,
      };
    }
    return aiTools;
  }

  // Use AI SDK helpers for proper tool format
  const { tool, jsonSchema } = helpers;

  return Object.fromEntries(
    mcpTools.map((mcpTool) => [
      mcpTool.name,
      tool({
        description: mcpTool.description || "No description",
        inputSchema: jsonSchema(mcpTool.inputSchema),
        // No execute function - tools are executed on the server side
      }),
    ]),
  );
}
