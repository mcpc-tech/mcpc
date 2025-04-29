import {
  generateId,
  generateObject,
  type LanguageModelV1CallOptions,
  type LanguageModelV1Middleware,
  type LanguageModelV1StreamPart,
} from "ai";

import { p } from "../utils/common/ai.ts";

import type { WecomIncomingParams } from "../schemas/wecom.ts";
import { parseJSON } from "../utils/common/json.ts";
import { Tool } from "@modelcontextprotocol/sdk";

export enum ImitateToolCallTagForLlama {
  StartTag = "<tool_call>",
  EndTag = "</tool_call>",
}

export enum ImitateToolCallTagForQwen {
  // StartTag = "'''",
  // EndTag = "'''",
  StartTag = "```tool",
  EndTag = "```",
}

export const toolCallPattern: RegExp = new RegExp(
  `${ImitateToolCallTagForQwen.StartTag}([\\s\\S]*?)${ImitateToolCallTagForQwen.EndTag}`,
  "g"
);

// System prompt to guide the model to use the tool call format
const imitateToolCallPrompt = `
# Tool Use Instructions

You have access to tools. To use a tool, you MUST output exactly in the following format, with no extra characters or markdown formatting:
{ImitateToolCallTag.StartTag}{"name": "tool_name", "parameters": {"param1": "value1", "param2": "value2"}}{ImitateToolCallTag.EndTag}

CRITICAL:
1.  You MUST include both the opening tag {ImitateToolCallTag.StartTag} and the closing tag {ImitateToolCallTag.EndTag}.
2.  The closing tag {ImitateToolCallTag.EndTag} MUST immediately follow the JSON object. No text or newlines between the JSON closing brace } and {ImitateToolCallTag.EndTag}.
3.  Only call one tool per turn. Wait for the response before deciding your next action or tool call.
4.  The parameters object within the JSON should only contain the parameter names and the actual values you want to use for the call (e.g., "param_name": actual_value). Do NOT include type, description, or other definition details within the call itself.
5.  You can analyze parameters before calling a tool, but do NOT output parameters code block. Directly execute the tool call.

## Available Tools
Tool definitions are provided below within <tool_definition> tags. Use these to understand the tool's purpose and required parameters. This definition format is for your information only, NOT for making the call.
<tool_definition>{"name": "tool_name", "description": "tool_description", "parameters": {"param1": {"type": "string", "description": "description of param1"}, "param2": {"type": "number", "description": "description of param2"}}}</tool_definition>

Example Definitions - DO NOT CALL THESE, just understand the format:
<tool_definition>{"name": "search", "description": "Useful for when you need to answer questions about current events. Ask targeted questions.", "parameters": {"query": {"type": "string", "description": "The search query"}}}</tool_definition>
<tool_definition>{"name": "calculator", "description": "Useful for performing mathematical calculations.", "parameters": {"operation": {"type": "string", "description": "Operation (add, subtract, multiply, divide)"}, "x": {"type": "number", "description": "First number"}, "y": {"type": "number", "description": "Second number"}}}</tool_definition>

## Correct Tool Call Examples
Notice the exact format: {ImitateToolCallTag.StartTag}JSON{ImitateToolCallTag.EndTag}
{ImitateToolCallTag.StartTag}{"name": "search", "parameters": {"query": "Latest AI research breakthroughs"}}{ImitateToolCallTag.EndTag}
{ImitateToolCallTag.StartTag}{"name": "calculator", "parameters": {"operation": "multiply", "x": 15, "y": 8}}{ImitateToolCallTag.EndTag}
{ImitateToolCallTag.StartTag}{"name": "capi.capi.post-/cls/SearchLog", "parameters": {"inputParams": {"From": 1744924800000, "To": 1744968000000, "Query": "*", "TopicId": "57fc27cc-359c-49dc-9f2b-f40f0cad78ec", "Limit": 2, "Sort": "desc"}}}{ImitateToolCallTag.EndTag}

## Wrong Tool Call Examples
Notice the exact format: {ImitateToolCallTag.StartTag}JSON{ImitateToolCallTag.EndTag}
No end tag: {ImitateToolCallTag.StartTag}{"name": "search", "parameters": {"query": "Latest AI research breakthroughs"}}
Missing start/end tag: {"name": "search", "parameters": {"query": "Latest AI research breakthroughs"}}
Invalid json: {ImitateToolCallTag.StartTag}{"name": "search", "parameters": {"query": "Latest AI research breakthroughs"}{ImitateToolCallTag.EndTag}

## Your Available Tools:
{tool_definitions}
`;

export const processBuffer = (
  buffer: string,
  isFlushing = false
): {
  isTool?: boolean;
  emitContent?: Array<{
    type: "text" | "tool";
    content: string;
    toolCallContent?: string;
    position?: { start: number; end: number };
  }>;
} => {
  const result = {
    isTool: false,
    emitContent: [] as Array<{
      type: "text" | "tool";
      content: string;
      toolCallContent?: string;
      position?: { start: number; end: number };
    }>,
  };

  // Find the position of the next opening tag
  const openTagPos = buffer.indexOf(ImitateToolCallTagForQwen.StartTag);

  // If no opening tag is found, emit all text up to the last 10 characters
  // (to handle potential partial tags at the end)
  if (openTagPos === -1) {
    if (!isFlushing) {
      const safeLength = Math.max(0, buffer.length - 10);

      if (safeLength > 0) {
        result.emitContent.push({
          type: "text",
          content: buffer.substring(0, safeLength),
          position: { start: 0, end: safeLength },
        });
      }
    }

    return result;
  }

  result.isTool = true;

  // Emit text before the opening tag
  if (openTagPos > 0) {
    result.emitContent.push({
      type: "text",
      content: buffer.substring(0, openTagPos),
      position: { start: 0, end: openTagPos },
    });
  }

  // Check for a complete tool call
  const closeTagPos = buffer.indexOf(
    ImitateToolCallTagForQwen.EndTag,
    openTagPos + ImitateToolCallTagForQwen.StartTag.length
  );

  if (closeTagPos === -1) {
    return result;
  }

  // Extract the complete tool call
  const toolCallContent = buffer
    .substring(
      openTagPos + ImitateToolCallTagForQwen.StartTag.length,
      closeTagPos
    )
    .trim();

  // Add the tool call to the emit content
  result.emitContent.push({
    type: "tool",
    content: p(
      "{ImitateToolCallTag.StartTag}{toolCallContent}{ImitateToolCallTag.EndTag}"
    )({
      "ImitateToolCallTag.EndTag": ImitateToolCallTagForQwen.EndTag,
      "ImitateToolCallTag.StartTag": ImitateToolCallTagForQwen.StartTag,
      toolCallContent,
    }),
    toolCallContent,
    position: {
      start: openTagPos,
      end: closeTagPos + ImitateToolCallTagForQwen.EndTag.length,
    },
  });

  // Continue processing if there might be more tool calls
  if (
    buffer
      .substring(closeTagPos + ImitateToolCallTagForQwen.EndTag.length)
      .includes(ImitateToolCallTagForQwen.StartTag)
  ) {
    const remainingBuffer = buffer.substring(
      closeTagPos + ImitateToolCallTagForQwen.EndTag.length
    );
    const nextResult = processBuffer(remainingBuffer, isFlushing);

    // Adjust positions for the remaining content
    if (nextResult.emitContent) {
      for (const item of nextResult.emitContent) {
        if (item.position) {
          item.position.start +=
            closeTagPos + ImitateToolCallTagForQwen.EndTag.length;
          item.position.end +=
            closeTagPos + ImitateToolCallTagForQwen.EndTag.length;
        }
      }
    }

    return {
      isTool: nextResult.isTool,
      emitContent: [...result.emitContent, ...(nextResult.emitContent || [])],
    };
  }

  // Check if there might be a partial tool call at the end of the buffer
  result.isTool =
    closeTagPos + ImitateToolCallTagForQwen.EndTag.length === buffer.length;

  return result;
};

/**
 * Process a tool call content and emit appropriate stream parts
 */
function processToolCall(
  toolCallContent: string,
  controller: TransformStreamDefaultController<LanguageModelV1StreamPart>
) {
  try {
    // Parse the JSON from the tool call
    const parsedToolCall = parseJSON(toolCallContent) as Tool;
    // Validate the tool call structure
    if (!parsedToolCall) {
      throw new Error("Invalid tool call structure");
    }

    // Emit the tool call as a structured event
    controller.enqueue({
      type: "tool-call",
      toolCallType: "function",
      toolCallId: generateId(),
      toolName: parsedToolCall.name,
      args: JSON.stringify(parsedToolCall.parameters || {}),
    });

    controller.enqueue({
      type: "text-delta",
      textDelta: p(
        "{ImitateToolCallTag.StartTag}{toolCallContent}{ImitateToolCallTag.EndTag}"
      )({
        "ImitateToolCallTag.EndTag": ImitateToolCallTagForQwen.EndTag,
        "ImitateToolCallTag.StartTag": ImitateToolCallTagForQwen.StartTag,
        toolCallContent,
      }),
    });
  } catch (e) {
    // Handle parsing errors
    console.error(
      `Failed to parse tool call JSON: ${e}. Content: '${toolCallContent}'`
    );

    controller.enqueue({
      type: "text-delta",
      textDelta: `[parse error] ${e} \n\`\`\`json\n${toolCallContent}\n\`\`\`\n`,
    });
  }
}
/**
 * Create a transformer function for processing tool calls in a stream
 */
function createToolCallTransformer() {
  let buffer = "";

  return {
    transform: (
      chunk: LanguageModelV1StreamPart,
      controller: TransformStreamDefaultController<LanguageModelV1StreamPart>
    ) => {
      // Only process text-delta chunks
      if (chunk.type !== "text-delta") {
        controller.enqueue(chunk);
        return;
      }

      // Add the new text to our buffer
      buffer += chunk.textDelta;

      // Process the buffer for complete tool calls
      const result = processBuffer(buffer, false);

      // Emit the content
      if (result.emitContent) {
        for (const item of result.emitContent) {
          if (item.type === "text") {
            controller.enqueue({
              type: "text-delta",
              textDelta: item.content,
            });

            // Remove the processed content from the buffer
            if (item.position) {
              buffer =
                buffer.substring(0, item.position.start) +
                buffer.substring(item.position.end);
            }
          } else if (item.type === "tool" && item.toolCallContent) {
            // Process the tool call
            processToolCall(item.toolCallContent, controller);

            // Remove the processed tool call from the buffer
            if (item.position) {
              buffer =
                buffer.substring(0, item.position.start) +
                buffer.substring(item.position.end);
            }
          }
        }
      }
    },

    flush: (
      controller: TransformStreamDefaultController<LanguageModelV1StreamPart>
    ) => {
      // Check for any remaining complete tool calls
      const result = processBuffer(buffer, true);

      // Emit the content
      if (result.emitContent) {
        for (const item of result.emitContent) {
          if (item.type === "text") {
            controller.enqueue({
              type: "text-delta",
              textDelta: item.content,
            });
          } else if (item.type === "tool" && item.toolCallContent) {
            // Process the tool call
            processToolCall(item.toolCallContent, controller);
          }
        }
      }

      // If there's any remaining text in the buffer, emit it
      if (buffer.length > 0) {
        controller.enqueue({
          type: "text-delta",
          textDelta: buffer,
        });
      }
    },
  };
}

/**
 * Middleware that imitates tool use functionality for models that don't natively support it
 */
export function imitateToolUseMiddleware(
  params?: WecomIncomingParams
): LanguageModelV1Middleware {
  return {
    transformParams: async ({ params: originalParams }) => {
      const { prompt } = originalParams;

      const tools =
        originalParams.mode.type === "regular"
          ? originalParams.mode.tools ?? []
          : [];

      if (tools.length === 0) {
        return originalParams;
      }

      const toolDefinitions = tools.map((tool) => {
        return `<tool_definition>\n${JSON.stringify(tool)}\n</tool_definition>`;
      });

      const imitateToolCallPromptDefined = p(imitateToolCallPrompt)(
        // @ts-expect-error - ingore json syntax
        {
          tool_definitions: toolDefinitions.join("\n"),
          "ImitateToolCallTag.StartTag": ImitateToolCallTagForQwen.StartTag,
          "ImitateToolCallTag.EndTag": ImitateToolCallTagForQwen.EndTag,
        }
      );

      // Enhance system prompt with tool instructions
      let toolSystemPrompt;

      if (Array.isArray(prompt[0].content)) {
        // Handle multimodal content (array of content parts)
        toolSystemPrompt = [
          {
            role: "system",
            content: prompt[0].content.map((content, index) => {
              if (
                index === 0 &&
                typeof (content as { text?: string }).text === "string"
              ) {
                return {
                  ...content,
                  text:
                    (content as { text: string }).text +
                    "\n\n" +
                    imitateToolCallPromptDefined,
                };
              }

              return content;
            }),
          },
          ...prompt.slice(1),
        ];
      } else {
        // Handle string content
        toolSystemPrompt = [
          {
            role: "system",
            content:
              typeof prompt[0].content === "string"
                ? prompt[0].content + "\n\n" + imitateToolCallPromptDefined
                : imitateToolCallPromptDefined,
          },
          ...prompt.slice(1),
        ];
      }

      return {
        ...originalParams,
        prompt: toolSystemPrompt,
        inputFormat: originalParams.inputFormat || "messages",
      } as LanguageModelV1CallOptions;
    },
    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream();

      // Create a transformer to process the stream
      const transformer = createToolCallTransformer();

      // Pipe the stream through our transformer
      const processedStream = stream.pipeThrough(
        new TransformStream<
          LanguageModelV1StreamPart,
          LanguageModelV1StreamPart
        >(transformer)
      );

      return {
        stream: processedStream,
        ...rest,
      };
    },
  };
}
