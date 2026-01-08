import type { ContentBlock } from "@agentclientprotocol/sdk";
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3FunctionTool,
  LanguageModelV3ProviderTool,
} from "@ai-sdk/provider";
import { extractBase64Data } from "./utils.ts";
import { asSchema, type Tool } from "ai";
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
