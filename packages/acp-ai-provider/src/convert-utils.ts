import type { ContentBlock } from "@agentclientprotocol/sdk";
import type { LanguageModelV2CallOptions } from "@ai-sdk/provider";
import { extractBase64Data } from "./utils.ts";
import type { Tool } from "ai";
import { getExecuteByName, hasRegisteredExecute } from "./acp-tool.ts";

/**
 * Converts AI SDK prompt messages into ACP ContentBlock objects.
 * Prefixes text with role since ACP ContentBlock has no role field.
 *
 * @param options - The call options from the language model
 * @param isFreshSession - Whether this is a fresh session (send full history) or reused (send only latest user message)
 */
export function convertAiSdkMessagesToAcp(
  options: LanguageModelV2CallOptions,
  isFreshSession: boolean,
): ContentBlock[] {
  // If not a fresh session (meaning persistent session reused), only send the latest user message
  const messages = !isFreshSession
    ? options.prompt.filter((m) => m.role === "user").slice(-1)
    : options.prompt;

  const contentBlocks: ContentBlock[] = [];

  for (const msg of messages) {
    // Prefix to identify role since ACP has no role field
    let prefix = "";
    if (msg.role === "system") prefix = "System: ";
    else if (msg.role === "assistant") prefix = "Assistant: ";
    else if (msg.role === "tool") prefix = "Result: ";

    if (Array.isArray(msg.content)) {
      let isFirst = true;
      for (const part of msg.content) {
        if (part.type === "text") {
          const text = isFirst ? `${prefix}${part.text} ` : part.text;
          contentBlocks.push({ type: "text" as const, text });
          isFirst = false;
        } else if (part.type === "tool-call") {
          // Convert tool-call to text representation for ACP
          const toolCallText = `[Tool Call: ${part.toolName}(${JSON.stringify(part.input)})]`;
          const text = isFirst ? `${prefix}${toolCallText} ` : toolCallText;
          contentBlocks.push({ type: "text" as const, text });
          isFirst = false;
        } else if (part.type === "tool-result") {
          const resultText = JSON.stringify((part as any).result);
          const text = isFirst ? `${prefix}${resultText} ` : resultText;
          contentBlocks.push({ type: "text" as const, text });
          isFirst = false;
        } else if (part.type === "file" && typeof part.data === "string") {
          const type = part.mediaType.startsWith("image/")
            ? "image"
            : part.mediaType.startsWith("audio/")
            ? "audio"
            : null;
          if (type) {
            contentBlocks.push({
              type,
              mimeType: part.mediaType,
              data: extractBase64Data(part.data),
            });
          }
        }
      }
    } else if (typeof msg.content === "string") {
      contentBlocks.push({
        type: "text" as const,
        text: `${prefix}${msg.content} `,
      });
    }
  }

  return contentBlocks;
}

/**
 * Extracts ACP tools from the provided options that have a registered execution handler.
 * These tools will be proxied to the agent.
 *
 * @param tools - The tools array from the language model options
 */
export function extractACPTools(
  tools?: LanguageModelV2CallOptions["tools"],
): Array<Tool<any, any> & { name: string }> {
  const acpTools: Array<Tool<any, any> & { name: string }> = [];

  if (!tools) {
    return acpTools;
  }

  for (const t of tools) {
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
              execute,
            } as unknown as Tool<any, any> & { name: string },
          );
        }
      }
    }
  }

  return acpTools;
}
