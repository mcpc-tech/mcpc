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
  LanguageModelV2ToolCall,
} from "@ai-sdk/provider";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type {
  CreateMessageRequestParams,
  SamplingMessage,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import type { ModelPreferences } from "./provider.ts";
import { convertAISDKToMCPMessages, convertMCPStopReasonToAISDK } from "./utils.ts";

/**
 * Configuration for MCP Language Model
 */
export interface MCPSamplingLanguageModelConfig {
  server: Server;
  modelPreferences?: ModelPreferences;
}

/**
 * MCP Language Model implementation of AI SDK's LanguageModelV2 interface
 *
 * This allows MCP server's createMessage capability to be used through AI SDK's standard interface.
 * The model uses MCP server's createMessage method under the hood.
 */
export class MCPSamplingLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = "v2" as const;
  readonly provider: string;
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  private server: Server;
  private modelPreferences?: ModelPreferences;

  constructor(config: MCPSamplingLanguageModelConfig) {
    this.server = config.server;
    this.modelId = "";
    this.provider = "mcp-client";
    this.modelPreferences = config.modelPreferences;
  }

  /**
   * Generate a response using MCP's createMessage capability
   */
  async doGenerate(options: LanguageModelV2CallOptions): Promise<{
    content: LanguageModelV2Content[];
    finishReason: LanguageModelV2FinishReason;
    usage: {
      inputTokens: number | undefined;
      outputTokens: number | undefined;
      totalTokens: number;
    };
    request?: {
      body?: string;
    };
    response?: {
      modelId?: string;
      headers?: Record<string, string>;
    };
    warnings: LanguageModelV2CallWarning[];
  }> {
    // Convert AI SDK messages to MCP Sampling format
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

    // Inject response format instructions into system prompt
    // TODO: Remove this workaround when MCP natively supports responseFormat
    systemPrompt = this.injectResponseFormatInstructions(systemPrompt, options.responseFormat);

    // Check if client supports native tools
    const useNativeTools = this.supportsSamplingTools();

    // Inject tool definitions into system prompt (only for JSON fallback mode)
    // injectToolInstructions will skip injection when using native tools mode
    systemPrompt = this.injectToolInstructions(systemPrompt, options.tools, useNativeTools);

    // Build createMessage params based on mode
    const createMessageParams: CreateMessageRequestParams = {
      systemPrompt,
      messages,
      maxTokens: options.maxOutputTokens ?? 55_000,
      modelPreferences: this.modelPreferences,
    };

    // Add tools and toolChoice when using native tools mode
    if (useNativeTools && options.tools && options.tools.length > 0) {
      createMessageParams.tools = this.convertAISDKToolsToMCP(options.tools);
      createMessageParams.toolChoice = { mode: "auto" as const };
    }

    // Call MCP server's createMessage method
    const result = await this.server.createMessage(createMessageParams);

    // Extract text and tool calls from result
    const content: LanguageModelV2Content[] = [];

    // Handle response based on mode
    if (useNativeTools) {
      // Native tools mode: check for tool_use content blocks
      const contentArray = Array.isArray(result.content) ? result.content : [result.content];

      for (const block of contentArray) {
        if (block.type === "text" && "text" in block) {
          // Add text content
          content.push({
            type: "text",
            text: block.text as string,
          });
        } else if (block.type === "tool_use" && "id" in block && "name" in block) {
          // Add native tool call content
          const toolInput = (block as any).input || {};
          content.push({
            type: "tool-call",
            toolCallId: block.id as string,
            toolName: block.name as string,
            args: JSON.stringify(toolInput),
            input: toolInput,
          } as LanguageModelV2Content);
        }
      }
    } else {
      // JSON/XML fallback mode: parse XML-style tool calls from text
      if (result.content.type === "text" && result.content.text) {
        const { text, toolCalls } = this.extractToolCalls(result.content.text, options.tools);

        // Add text content if present
        if (text.trim()) {
          const textContent: LanguageModelV2Text = {
            type: "text",
            text: text,
          };
          content.push(textContent);
        }

        // Add tool call content
        content.push(...toolCalls);
      }
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
      },
      warnings: [],
    };
  }

  /**
   * Stream a response using MCP's createMessage capability
   *
   * Since MCP doesn't support native streaming, we generate the full response
   * and emit it as stream events following AI SDK's protocol.
   */
  async doStream(options: LanguageModelV2CallOptions): Promise<{
    stream: ReadableStream<LanguageModelV2StreamPart>;
    request?: { body?: string };
    warnings: LanguageModelV2CallWarning[];
  }> {
    const result = await this.doGenerate(options);

    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      start(controller) {
        // 1. Send response metadata
        if (result.response?.modelId) {
          controller.enqueue({
            type: "response-metadata",
            modelId: result.response.modelId,
            ...(result.response.headers && { headers: result.response.headers }),
          });
        }

        // 2. Send content parts
        let textIndex = 0;
        for (const part of result.content) {
          if (part.type === "text") {
            const id = `text-${++textIndex}`;
            // AI SDK requires: text-start → text-delta → text-end
            controller.enqueue({ type: "text-start", id });
            controller.enqueue({ type: "text-delta", id, delta: part.text });
            controller.enqueue({ type: "text-end", id });
          } else if (part.type === "tool-call") {
            controller.enqueue({
              type: "tool-call",
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: JSON.stringify(part.input),
            });
          }
        }

        // 3. Send finish event
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
    return convertAISDKToMCPMessages(prompt);
  }

  /**
   * Map MCP stop reason to AI SDK finish reason
   */
  private mapStopReason(stopReason?: string): LanguageModelV2FinishReason {
    return convertMCPStopReasonToAISDK(stopReason);
  }

  /**
   * Check if client supports native tool use in sampling
   */
  private supportsSamplingTools(): boolean {
    const capabilities = this.server.getClientCapabilities();
    return !!capabilities?.sampling?.tools;
  }

  /**
   * Convert AI SDK tools to MCP Tool format
   */
  private convertAISDKToolsToMCP(tools?: LanguageModelV2CallOptions["tools"]): Tool[] {
    if (!tools || tools.length === 0) return [];

    return tools
      .filter((tool) => tool.type === "function")
      .map((tool) => {
        const toolAny = tool as any;
        return {
          name: tool.name,
          description: toolAny.description || `Tool: ${tool.name}`,
          inputSchema: {
            type: "object" as const,
            ...(toolAny.inputSchema || toolAny.parameters),
          },
        };
      });
  }

  /**
   * Inject response format instructions into system prompt
   *
   * WORKAROUND: MCP sampling currently doesn't support native responseFormat parameter.
   * This method injects formatting instructions directly into the system prompt.
   *
   * TODO: Remove this workaround when MCP protocol adds native support for:
   * - responseFormat parameter in createMessage
   * - JSON schema validation
   * - Structured output modes
   */
  private injectResponseFormatInstructions(
    systemPrompt: string | undefined,
    responseFormat?: LanguageModelV2CallOptions["responseFormat"],
  ): string | undefined {
    // If no response format specified, return original prompt
    if (!responseFormat) {
      return systemPrompt;
    }

    let enhanced = systemPrompt || "";

    // Handle JSON response format
    if (responseFormat.type === "json") {
      const jsonPrompt = `

IMPORTANT: You MUST respond with valid JSON only. Do not include any text before or after the JSON.
- Your response must be a valid JSON object
- Do not wrap the JSON in markdown code blocks
- Do not include explanations or comments
- Ensure all JSON is properly formatted and parseable`;

      enhanced = enhanced ? `${enhanced}${jsonPrompt}` : jsonPrompt.trim();

      // If schema is provided, add schema information
      if (responseFormat.schema) {
        const schemaInfo = `
- Follow this JSON schema structure: ${JSON.stringify(responseFormat.schema)}`;
        enhanced += schemaInfo;
      }
    }

    return enhanced || undefined;
  }

  /**
   * Inject tool definitions into system prompt
   *
   * WORKAROUND: MCP sampling currently doesn't support native tools parameter.
   * This method injects tool descriptions and usage instructions into the system prompt.
   *
   * TODO: Remove this workaround when MCP protocol adds native support for:
   * - tools parameter in createMessage
   * - Tool calling and function execution
   * - Structured tool responses
   */
  private injectToolInstructions(
    systemPrompt: string | undefined,
    tools?: LanguageModelV2CallOptions["tools"],
    useNativeTools?: boolean,
  ): string | undefined {
    // If no tools specified, return original prompt
    if (!tools || tools.length === 0) {
      return systemPrompt;
    }

    // If using native tools mode, don't inject XML-style instructions
    if (useNativeTools) {
      return systemPrompt;
    }

    let enhanced = systemPrompt || "";

    // Build tool instructions using XML format
    const toolsPrompt = `

AVAILABLE TOOLS:
You have access to the following tools. To use a tool, respond with this XML format:
<use_tool tool="tool_name">
{"param1": "value1", "param2": "value2"}
</use_tool>

Follow the JSON schema definition for each tool's parameters.
You can use multiple tools in one response. You can include text before tool calls, but do NOT include text after tool calls - wait for the tool results first.

Tools:`;

    // Add each tool's description
    const toolDescriptions = tools
      .map((tool) => {
        // Handle different tool types
        if (tool.type === "function") {
          const toolAny = tool as any;
          const description = toolAny.description || "No description provided";
          // Try both inputSchema and parameters for compatibility
          const schema = toolAny.inputSchema || toolAny.parameters;
          const params = schema ? `\n  JSON Schema: ${JSON.stringify(schema, null, 2)}` : "";
          return `
- ${tool.name}: ${description}${params}`;
        } else if (tool.type === "provider-defined") {
          return `
- ${tool.name}: ${tool.id || "No description provided"}`;
        }
        return "";
      })
      .filter(Boolean)
      .join("");

    enhanced = enhanced
      ? `${enhanced}${toolsPrompt}${toolDescriptions}`
      : `${toolsPrompt}${toolDescriptions}`.trim();

    return enhanced || undefined;
  }

  /**
   * Extract tool calls from LLM response text
   *
   * Parses XML-style tool call tags from the response:
   * <use_tool tool="tool_name">{"arg": "value"}</use_tool>
   */
  private extractToolCalls(
    responseText: string,
    tools?: LanguageModelV2CallOptions["tools"],
  ): {
    text: string;
    toolCalls: LanguageModelV2Content[];
  } {
    // If no tools available, return plain text
    if (!tools || tools.length === 0) {
      return { text: responseText, toolCalls: [] };
    }

    const toolCalls: LanguageModelV2ToolCall[] = [];

    // Regular expression to match <use_tool tool="name">...</use_tool>
    const toolCallRegex = /<use_tool\s+tool="([^"]+)">([\s\S]*?)<\/use_tool>/g;

    let match;
    let lastIndex = 0;
    const textParts: string[] = [];
    let callIndex = 0;

    while ((match = toolCallRegex.exec(responseText)) !== null) {
      // Add text before this tool call
      textParts.push(responseText.slice(lastIndex, match.index));

      const toolName = match[1];
      const argsText = match[2].trim?.();

      toolCalls.push({
        type: "tool-call",
        toolCallId: `call_${Date.now()}_${callIndex++}`,
        toolName: toolName,
        input: argsText,
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last tool call
    textParts.push(responseText.slice(lastIndex));

    const text = textParts.join("").trim();

    return { text, toolCalls };
  }
}
