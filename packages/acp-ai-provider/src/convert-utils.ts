import type {
  ContentBlock,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3FunctionTool,
  LanguageModelV3ProviderTool,
} from "@ai-sdk/provider";
import { extractBase64Data } from "./utils.ts";
import { asSchema, type ModelMessage, type Tool } from "ai";
import { getExecuteByName, hasRegisteredExecute } from "./acp-tool.ts";

const ROLE_PREFIXES: Record<string, string> = {
  system: "System: ",
  assistant: "Assistant: ",
  tool: "Result: ",
};

function getRolePrefix(role: string): string {
  return ROLE_PREFIXES[role] || "";
}

function getMediaType(mimeType: string): "image" | "audio" | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  return null;
}

/**
 * Converts AI SDK prompt messages into ACP ContentBlock objects.
 * Prefixes text with role since ACP ContentBlock has no role field.
 *
 * @param options - The call options from the language model
 * @param isFreshSession - Whether this is a fresh session (send full history) or reused (send only latest user message)
 */
export function convertAiSdkMessagesToAcp(
  options: LanguageModelV3CallOptions,
  isFreshSession: boolean,
): ContentBlock[] {
  const messages = !isFreshSession
    ? options.prompt.filter((m) => m.role === "user").slice(-1)
    : options.prompt;

  const contentBlocks: ContentBlock[] = [];

  for (const msg of messages) {
    const prefix = getRolePrefix(msg.role);

    if (typeof msg.content === "string") {
      contentBlocks.push({ type: "text", text: `${prefix}${msg.content} ` });
      continue;
    }

    if (!Array.isArray(msg.content)) continue;

    let needsPrefix = true;
    for (const part of msg.content) {
      const currentPrefix = needsPrefix ? prefix : "";

      if (part.type === "text") {
        contentBlocks.push({ type: "text", text: currentPrefix + part.text });
        needsPrefix = false;
      }

      if (part.type === "tool-call") {
        const toolCallText = `[Tool Call: ${part.toolName}(${
          JSON.stringify(part.input)
        })]`;
        contentBlocks.push({
          type: "text",
          text: currentPrefix + toolCallText,
        });
        needsPrefix = false;
      }

      if (part.type === "tool-result") {
        const resultData = (part as any).result ?? (part as any).output;
        const resultText = JSON.stringify(resultData) ?? "null";
        contentBlocks.push({ type: "text", text: currentPrefix + resultText });
        needsPrefix = false;
      }

      if (part.type === "file" && typeof part.data === "string") {
        const mediaType = getMediaType(part.mediaType);
        if (mediaType) {
          contentBlocks.push({
            type: mediaType,
            mimeType: part.mediaType,
            data: extractBase64Data(part.data),
          });
        }
      }
    }
  }

  return contentBlocks;
}

/** Input type for tools - matches streamText's tools parameter */
export type ToolsInput =
  | (LanguageModelV3FunctionTool | LanguageModelV3ProviderTool)[]
  | Record<string, Tool<any, any>>;

/**
 * Extracts ACP tools from the provided options that have a registered execution handler.
 * These tools will be proxied to the agent.
 *
 * @param tools - Tools in either array or Record format (matches streamText's tools param)
 * @param prepared - Whether the schema has been converted to a prepared format.
 * If tools go through streamText's transformation, they are prepared.
 */
export function extractACPTools(
  tools?: ToolsInput,
  prepared = true,
): Array<Tool<any, any> & { name: string }> {
  const acpTools: Array<Tool<any, any> & { name: string }> = [];

  if (!tools) {
    return acpTools;
  }

  // Convert Record<string, Tool> to array format if needed
  const toolsArray = Array.isArray(tools)
    ? tools
    : Object.entries(tools).map(([name, tool]) => ({
      type: "function" as const,
      name,
      ...tool,
    }));

  for (const t of toolsArray) {
    if (t.type === "function") {
      // AI SDK internally converts parameters to inputSchema
      // LanguageModelV2CallTool has `name` property
      const toolWithSchema = t as unknown as Record<string, unknown>;
      const toolInputSchema = toolWithSchema.inputSchema as
        | Record<string, unknown>
        | undefined;

      // Check if this tool has a registered execute (by name)
      if (hasRegisteredExecute(t.name) && toolInputSchema) {
        const execute = getExecuteByName(t.name);
        if (execute) {
          // Add name to Tool for internal tracking
          acpTools.push(
            {
              ...t,
              name: t.name,
              inputSchema: prepared
                ? toolInputSchema
                : asSchema(toolInputSchema as any).jsonSchema,
              execute,
            } as Tool<any, any> & { name: string },
          );
        }
      }
    }
  }

  return acpTools;
}

/**
 * Converts ACP session notifications (replayed history) to AI SDK CoreMessage format.
 *
 * This function processes the sessionUpdate notifications that an ACP agent sends
 * during loadSession to replay conversation history. It groups related notifications
 * into proper AI SDK message structures.
 *
 * Supported notification types:
 * - user_message_chunk -> user message
 * - agent_message_chunk -> assistant message (text)
 * - agent_thought_chunk -> assistant message (reasoning, if supported)
 * - tool_call -> assistant message (tool call)
 * - tool_call_update (completed/failed) -> tool message (result)
 *
 * @param notifications - Array of SessionNotification from loadSession
 * @returns Array of ModelMessage suitable for AI SDK
 */
export function convertAcpHistoryToAiSdk(
  notifications: SessionNotification[],
): ModelMessage[] {
  const messages: ModelMessage[] = [];

  // Accumulators for building messages
  let currentUserText = "";
  let currentAssistantText = "";
  let currentReasoningText = "";
  const pendingToolCalls: Array<{
    toolCallId: string;
    toolName: string;
    args: unknown;
  }> = [];
  const pendingToolResults: Array<{
    toolCallId: string;
    toolName: string;
    result: unknown;
    isError?: boolean;
  }> = [];

  // Helper to flush accumulated user message
  const flushUserMessage = () => {
    if (currentUserText.trim()) {
      messages.push({
        role: "user",
        content: currentUserText.trim(),
      });
      currentUserText = "";
    }
  };

  // Helper to flush accumulated assistant message
  const flushAssistantMessage = () => {
    if (currentAssistantText.trim() || pendingToolCalls.length > 0) {
      const content: any[] = [];

      if (currentAssistantText.trim()) {
        content.push({
          type: "text",
          text: currentAssistantText.trim(),
        });
      }

      // Add reasoning if present (AI SDK experimental feature)
      if (currentReasoningText.trim()) {
        content.push({
          type: "reasoning",
          text: currentReasoningText.trim(),
        });
      }

      // Add tool calls
      for (const tc of pendingToolCalls) {
        content.push({
          type: "tool-call",
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          args: tc.args,
        });
      }

      messages.push({
        role: "assistant",
        content: content.length === 1 && content[0].type === "text"
          ? content[0].text
          : content,
      } as ModelMessage);

      currentAssistantText = "";
      currentReasoningText = "";
      pendingToolCalls.length = 0;
    }
  };

  // Helper to flush tool results as tool message
  const flushToolResults = () => {
    if (pendingToolResults.length > 0) {
      messages.push({
        role: "tool",
        content: pendingToolResults.map((tr) => ({
          type: "tool-result",
          toolCallId: tr.toolCallId,
          toolName: tr.toolName,
          output: tr.result, // AI SDK uses 'output' not 'result'
          isError: tr.isError,
        })),
      } as ModelMessage);
      pendingToolResults.length = 0;
    }
  };

  for (const notification of notifications) {
    const update = notification.update;

    switch (update.sessionUpdate) {
      case "user_message_chunk": {
        // Flush any pending assistant/tool messages before user message
        flushAssistantMessage();
        flushToolResults();

        if (update.content.type === "text") {
          currentUserText += update.content.text;
        }
        break;
      }

      case "agent_message_chunk": {
        // Flush user message if we're starting assistant response
        flushUserMessage();

        if (update.content.type === "text") {
          currentAssistantText += update.content.text;
        }
        break;
      }

      case "agent_thought_chunk": {
        // Reasoning/thinking content
        flushUserMessage();

        if (update.content.type === "text") {
          currentReasoningText += update.content.text;
        }
        break;
      }

      case "tool_call": {
        // Flush user message, accumulate tool call
        flushUserMessage();

        const toolCallId = update.toolCallId;
        const toolName = update.title || toolCallId;
        const args = update.rawInput ?? {};

        // Only add if we have actual input (not just a pending notification)
        if (args && Object.keys(args as object).length > 0) {
          pendingToolCalls.push({
            toolCallId,
            toolName,
            args,
          });
        }
        break;
      }

      case "tool_call_update": {
        const status = update.status;

        // Only process completed/failed tool calls
        if (status === "completed" || status === "failed") {
          // Flush assistant message with tool calls before adding results
          flushAssistantMessage();

          const toolCallId = update.toolCallId;
          const toolName = update.title || toolCallId;
          const result = update.rawOutput ?? update.content ?? null;

          pendingToolResults.push({
            toolCallId,
            toolName,
            result,
            isError: status === "failed",
          });
        }
        break;
      }

      // Ignore other notification types (plan, available_commands_update, etc.)
      default:
        break;
    }
  }

  // Flush any remaining accumulated content
  flushUserMessage();
  flushAssistantMessage();
  flushToolResults();

  return messages;
}
