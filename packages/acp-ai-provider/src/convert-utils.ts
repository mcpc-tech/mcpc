import type { ContentBlock } from "@agentclientprotocol/sdk";
import type { LanguageModelV2CallOptions } from "@ai-sdk/provider";
import { convertUint8ArrayToBase64 } from "@ai-sdk/provider-utils";
import { extractBase64Data } from "./utils.ts";
import { asSchema, type Tool } from "ai";
import { getExecuteByName, hasRegisteredExecute } from "./acp-tool.ts";

/**
 * Converts AI SDK prompt messages into ACP ContentBlock objects.
 * Prefixes text with role since ACP ContentBlock has no role field.
 *
 * @param options - The call options from the language model
 * @param isFreshSession - Whether this is a fresh session (send full history) or reused (send only latest user message)
 * @param jsonSchemaPrompt - Optional JSON schema instruction to prepend to the prompt
 */
export function convertAiSdkMessagesToAcp(
  options: LanguageModelV2CallOptions,
  isFreshSession: boolean,
  jsonSchemaPrompt?: string,
): ContentBlock[] {
  // If not a fresh session (meaning persistent session reused), only send the latest user message
  const messages = !isFreshSession
    ? options.prompt.filter((m) => m.role === "user").slice(-1)
    : options.prompt;

  const contentBlocks: ContentBlock[] = [];

  // Prepend JSON schema instruction if provided
  if (jsonSchemaPrompt) {
    contentBlocks.push({ type: "text", text: jsonSchemaPrompt });
  }

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
          const toolCallText = `[Tool Call: ${part.toolName}(${
            JSON.stringify(part.input)
          })]`;
          const text = isFirst ? `${prefix}${toolCallText} ` : toolCallText;
          contentBlocks.push({ type: "text" as const, text });
          isFirst = false;
        } else if (part.type === "tool-result") {
          // Handle both 'result' and 'output' properties (AI SDK uses different formats)
          const resultData = (part as any).result ?? (part as any).output;
          const resultText = JSON.stringify(resultData) ?? "null";
          const text = isFirst ? `${prefix}${resultText} ` : resultText;
          contentBlocks.push({ type: "text" as const, text });
          isFirst = false;
        } else if (part.type === "file") {
          const type = part.mediaType.startsWith("image/")
            ? "image"
            : part.mediaType.startsWith("audio/")
            ? "audio"
            : null;
          if (type) {
            let base64Data: string | undefined;
            if (typeof part.data === "string") {
              base64Data = extractBase64Data(part.data);
            } else if (part.data instanceof Uint8Array) {
              base64Data = convertUint8ArrayToBase64(part.data);
            }
            // URL case: skip (cannot resolve remote URLs synchronously at provider level)
            if (base64Data !== undefined) {
              contentBlocks.push({
                type,
                mimeType: part.mediaType,
                data: base64Data,
              });
            }
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

/** Input type for tools - matches streamText's tools parameter */
export type ToolsInput =
  | LanguageModelV2CallOptions["tools"]
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

      // Check if this tool is registered (both server-side and client-side tools).
      // Client-side tools have execute as undefined.
      if (hasRegisteredExecute(t.name) && toolInputSchema) {
        const execute = getExecuteByName(t.name);
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

  return acpTools;
}
