import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
} from "@ai-sdk/provider";
import {
  type Client,
  ClientSideConnection,
  type ContentBlock,
  type InitializeRequest,
  ndJsonStream,
  type NewSessionRequest,
  PROTOCOL_VERSION,
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type WriteTextFileRequest,
  type WriteTextFileResponse,
} from "@agentclientprotocol/sdk";
import { type ChildProcess, spawn } from "node:child_process";
import process from "node:process";
import { Readable, Writable } from "node:stream";
import type { ACPProviderSettings } from "./types.ts";
import { jsonSchema, tool } from "ai";

/**
 * Implements the ACP client-side logic for handling file operations and permissions.
 * This basic implementation throws errors for file ops and auto-allows permissions.
 */
class ACPClient implements Client {
  private onSessionUpdateCallback?: (notification: SessionNotification) => void;
  private onPermissionRequestCallback?: (
    request: RequestPermissionRequest,
  ) => Promise<RequestPermissionResponse>;

  setSessionUpdateHandler(
    handler: (notification: SessionNotification) => void,
  ) {
    this.onSessionUpdateCallback = handler;
  }

  setPermissionRequestHandler(
    handler: (
      request: RequestPermissionRequest,
    ) => Promise<RequestPermissionResponse>,
  ) {
    this.onPermissionRequestCallback = handler;
  }

  sessionUpdate(params: SessionNotification): Promise<void> {
    if (this.onSessionUpdateCallback) {
      this.onSessionUpdateCallback(params);
    }
    return Promise.resolve();
  }

  async requestPermission(
    params: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse> {
    if (this.onPermissionRequestCallback) {
      return await this.onPermissionRequestCallback(params);
    }
    // Default: auto-allow the first option
    return {
      outcome: {
        outcome: "selected",
        optionId: params.options[0]?.optionId || "allow",
      },
    };
  }

  writeTextFile(params: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    console.log("Write file request (not implemented):", params.path);
    throw new Error("File operations not implemented in language model client");
  }

  readTextFile(params: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    console.log("Read file request (not implemented):", params.path);
    throw new Error("File operations not implemented in language model client");
  }
}

/**
 * Implements the AI SDK LanguageModelV2 interface for the
 * Agent Client Protocol (ACP).
 */
export class ACPLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = "v2" as const;
  readonly provider = "acp";
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  private config: ACPProviderSettings;
  private agentProcess: ChildProcess | null = null;
  private connection: ClientSideConnection | null = null;
  private sessionId: string | null = null;
  private client: ACPClient | null = null;

  // State for managing stream conversion
  private textBlockIndex = 0;
  private thinkBlockIndex = 0;
  private currentTextId: string | null = null;
  private currentThinkingId: string | null = null;
  private toolCallsMap = new Map<string, { index: number; name: string }>();

  constructor(modelId: string, config: ACPProviderSettings) {
    this.modelId = modelId;
    this.config = config;
  }

  /**
   * Resets the internal state used for stream conversion.
   */
  private resetStreamState(): void {
    this.textBlockIndex = 0;
    this.thinkBlockIndex = 0; // Added this line to match state
    this.currentTextId = null;
    this.currentThinkingId = null; // Added this line to match state
    this.toolCallsMap.clear();
  }

  /**
   * Parses a 'tool_call' notification update into a structured object.
   */
  private parseToolCall(update: any): {
    toolCallId: string;
    toolName: string;
    toolInput: unknown;
  } {
    const toolCallId = update.toolCallId;
    const toolName = update.title || update.toolCallId;
    let toolInput: unknown = {};
    if (update.rawInput) {
      toolInput = update.rawInput;
    } else if (update.content && update.content.length > 0) {
      const firstContent = update.content[0];
      if ("content" in firstContent && firstContent.content) {
        toolInput = firstContent.content;
      }
    }
    return { toolCallId, toolName, toolInput };
  }

  /**
   * Parses a 'tool_call_update' notification update into a structured object.
   */
  private parseToolResult(update: any): {
    toolCallId: string;
    toolName: string;
    toolResult: unknown;
    isError: boolean;
    status: string;
  } {
    const toolCallId = update.toolCallId;
    const toolName = update.title || update.toolCallId;
    let toolResult: unknown = null;
    if (update.rawOutput) {
      toolResult = update.rawOutput;
    } else if (update.content && update.content.length > 0) {
      const firstContent = update.content[0];
      if ("content" in firstContent && firstContent.content) {
        toolResult = firstContent.content;
      }
    }
    const isError = update.status === "failed";
    return {
      toolCallId,
      toolName,
      toolResult,
      isError,
      status: update.status,
    };
  }

  /**
   * Converts AI SDK prompt messages into an array of ACP ContentBlock objects.
   */
  private getPromptContent(
    options: LanguageModelV2CallOptions,
  ): ContentBlock[] {
    const contentBlocks: ContentBlock[] = [];

    for (const msg of options.prompt) {
      let prefix = "";
      // Note: ACP doesn't have a "system" role, so we prefix it.
      if (msg.role === "system") {
        prefix = "System: ";
      } else if (msg.role === "user") {
        prefix = "User: ";
      } else if (msg.role === "assistant") {
        prefix = "Assistant: ";
      }
      // Note: ACP doesn't have a "tool" role. Tool results are handled
      // by the agent itself, not by sending a message.

      if (
        msg.role === "system" ||
        msg.role === "user" ||
        msg.role === "assistant"
      ) {
        if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === "text") {
              contentBlocks.push({
                type: "text" as const,
                text: `${prefix}${part.text}`,
              });
              prefix = ""; // Only prefix the first part
            }
            // Other parts (like images) are ignored in this example
          }
        } else if (typeof msg.content === "string") {
          contentBlocks.push({
            type: "text" as const,
            text: `${prefix}${msg.content}`,
          });
        }
      }
    }

    return contentBlocks;
  }

  /**
   * Ensures the ACP agent process is running and a session is established.
   */
  private async ensureConnected(): Promise<void> {
    if (this.connection && this.sessionId) return;

    const sessionCwd = this.config.session?.cwd || process.cwd();

    this.agentProcess = spawn(this.config.command, this.config.args ?? [], {
      stdio: ["pipe", "pipe", "inherit"],
      env: { ...process.env, ...this.config.env },
      cwd: sessionCwd,
    });

    const input = Writable.toWeb(this.agentProcess.stdin!);
    const output = Readable.toWeb(
      this.agentProcess.stdout!,
    ) as ReadableStream<Uint8Array>;

    this.client = new ACPClient();

    this.connection = new ClientSideConnection(
      () => this.client!,
      ndJsonStream(input, output),
    );

    const initConfig: InitializeRequest = {
      ...(this.config.initialize ?? {}),
      protocolVersion: this.config.initialize?.protocolVersion ??
        PROTOCOL_VERSION,
      clientCapabilities: this.config.initialize?.clientCapabilities ?? {
        fs: {
          readTextFile: false,
          writeTextFile: false,
        },
        terminal: false,
      },
    };

    const initResult = await this.connection.initialize(initConfig);

    if (initResult.authMethods?.length ?? 0 > 0) {
      if (!this.config.authMethodId) {
        console.log(
          "⚠️ Warning: No authMethodId specified in config, using first available method. If this is not desired, please set one of the authMethodId in the ACPProviderSettings.",
          JSON.stringify(initResult.authMethods, null, 2),
        );
      }
      await this.connection.authenticate({
        methodId: this.config.authMethodId ?? initResult.authMethods?.[0].id!,
      });
    } else {
      console.log(
        `⚠️ No authentication methods required by the ACP agent, skipping authentication step.`,
      );
    }

    const sessionConfig: NewSessionRequest = {
      ...this.config.session,
      cwd: this.config.session.cwd ?? sessionCwd,
      mcpServers: this.config.session.mcpServers ?? [],
    };

    const session = await this.connection.newSession(sessionConfig);

    this.sessionId = session.sessionId;
  }

  /**
   * Kills the agent process and clears connection state.
   */
  private cleanup(): void {
    if (this.agentProcess) {
      this.agentProcess.kill();
      this.agentProcess = null;
    }
    this.connection = null;
    this.sessionId = null;
    this.client = null;
  }

  /**
   * Standardized handler for converting SessionNotifications into
   * LanguageModelV2StreamPart objects, pushing them onto a stream controller.
   */
  private handleStreamNotification(
    controller: ReadableStreamDefaultController<LanguageModelV2StreamPart>,
    notification: SessionNotification,
  ): void {
    const update = notification.update;
    switch (update.sessionUpdate) {
      case "plan":
        controller.enqueue({
          type: "raw",
          rawValue: JSON.stringify(update.entries),
        });
        break;
      case "agent_thought_chunk":
        if (!this.currentThinkingId) {
          this.currentThinkingId = `reasoning-${this.thinkBlockIndex++}`;
          controller.enqueue({
            type: "reasoning-start",
            id: this.currentThinkingId,
          });
        }

        controller.enqueue({
          type: "reasoning-delta",
          id: this.currentThinkingId,
          delta: update.content.type === "text" ? update.content.text : "",
        });

        controller.enqueue({
          type: "reasoning-end",
          id: this.currentThinkingId,
        });
        this.currentThinkingId = null;

        break;

      case "agent_message_chunk":
        if (update.content.type === "text") {
          const textChunk = update.content.text;
          if (!this.currentTextId) {
            this.currentTextId = `text-${this.textBlockIndex++}`;
            controller.enqueue({
              type: "text-start",
              id: this.currentTextId,
            });
          }
          controller.enqueue({
            type: "text-delta",
            id: this.currentTextId,
            delta: textChunk,
          });
          controller.enqueue({
            type: "text-end",
            id: this.currentTextId,
          });
          this.currentTextId = null;
        }
        break;

      case "tool_call": {
        // Close current text/thinking block when tool call starts
        if (this.currentTextId) {
          this.currentTextId = null;
        }
        if (this.currentThinkingId) {
          this.currentThinkingId = null;
        }

        const { toolCallId, toolName, toolInput } = this.parseToolCall(update);

        // We tell the AI SDK to call our "dynamic tool", passing the
        // *actual* tool info inside the input.
        controller.enqueue({
          type: "tool-call",
          toolCallId,
          toolName: "acp.acp_agent_dynamic_tool",
          input: JSON.stringify({
            toolCallId,
            toolName,
            args: toolInput,
          }),
        });

        this.toolCallsMap.set(toolCallId, {
          index: this.toolCallsMap.size,
          name: toolName,
        });
        break;
      }

      case "tool_call_update": {
        const { toolCallId, toolName, toolResult, isError, status } = this
          .parseToolResult(update);

        if (
          status === undefined ||
          status === "in_progress" ||
          status === "pending"
        ) {
          // Ignore intermediate updates
          break;
        }

        let toolInfo = this.toolCallsMap.get(toolCallId);

        if (!toolInfo) {
          // This can happen if the 'tool_call' notification was missed or
          // came after the update. We enqueue a 'tool-call' part now.
          toolInfo = {
            index: this.toolCallsMap.size,
            name: toolName,
          };
          this.toolCallsMap.set(toolCallId, toolInfo);
          controller.enqueue({
            type: "tool-call",
            toolCallId,
            toolName: "acp.acp_agent_dynamic_tool",
            input: JSON.stringify({ toolCallId, toolName }), // Note: input args are missing
          });
        }

        // Send the tool result
        controller.enqueue({
          type: "tool-result",
          toolCallId,
          toolName: "acp.acp_agent_dynamic_tool",
          result: toolResult,
          ...(isError && { isError: true }),
        });
        break;
      }
    }
  }

  /**
   * Implements the non-streaming generation method.
   */
  async doGenerate(options: LanguageModelV2CallOptions): Promise<{
    content: LanguageModelV2Content[];
    finishReason: LanguageModelV2FinishReason;
    usage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };
    warnings: LanguageModelV2CallWarning[];
  }> {
    try {
      await this.ensureConnected();

      const promptContent = this.getPromptContent(options);

      let accumulatedText = "";
      const toolCalls: Array<{
        id: string;
        name: string;
        input: unknown;
      }> = [];
      const toolResults: Map<
        string,
        { name: string; result: unknown; isError?: boolean }
      > = new Map();

      // This object mimics the ReadableStreamDefaultController API
      // to aggregate stream parts into final results.
      const mockController = {
        enqueue: (part: LanguageModelV2StreamPart) => {
          switch (part.type) {
            case "text-delta":
              accumulatedText += part.delta;
              break;

            case "tool-call": {
              // handleStreamNotification maps the real tool to 'acp.acp_agent_dynamic_tool'
              // and puts the real info in the 'input' JSON string.
              const inputData = JSON.parse(part.input as string);
              toolCalls.push({
                id: part.toolCallId,
                name: inputData.toolName, // The *real* tool name
                input: inputData.args,
              });
              break;
            }

            case "tool-result": {
              const matchingToolCall = toolCalls.find(
                (tc) => tc.id === part.toolCallId,
              );
              toolResults.set(part.toolCallId, {
                name: matchingToolCall?.name || "unknown_tool",
                result: part.result,
                isError: part.isError,
              });

              break;
            }

            // Other stream parts (reasoning, start/end blocks, etc.)
            // are ignored in non-streaming mode
            default:
              break;
          }
        },
      };

      // Get a reference to the bound method
      const streamHandler = this.handleStreamNotification.bind(this);

      // Reset stream state, as handleStreamNotification relies on it
      this.resetStreamState();

      if (this.client) {
        this.client.setSessionUpdateHandler((notification) => {
          // Reuse the stream notification handler, passing the mock controller
          streamHandler(
            mockController as unknown as ReadableStreamDefaultController<
              LanguageModelV2StreamPart
            >,
            notification,
          );
        });
      }

      const response = await this.connection!.prompt({
        sessionId: this.sessionId!,
        prompt: promptContent,
      });

      const content: LanguageModelV2Content[] = [];

      if (accumulatedText.trim()) {
        content.push({
          type: "text",
          text: accumulatedText,
        });
      }

      // In doGenerate, we report the *completed* tool call, including its
      // output. This is a "report" of what the agent did.
      for (const toolCall of toolCalls) {
        content.push({
          type: "tool-call",
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          args: JSON.stringify(toolCall.input),
          input: toolCall.input,
          output: toolResults.get(toolCall.id)?.result,
        } as LanguageModelV2Content);
      }

      const result = {
        content,
        finishReason: response.stopReason === "end_turn"
          ? ("stop" as const)
          : ("other" as const),
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        },
        warnings: [] as LanguageModelV2CallWarning[],
      };

      this.cleanup();

      return result;
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  /**
   * Implements the streaming generation method.
   */
  async doStream(options: LanguageModelV2CallOptions): Promise<{
    stream: ReadableStream<LanguageModelV2StreamPart>;
    warnings: LanguageModelV2CallWarning[];
  }> {
    await this.ensureConnected();
    const promptContent = this.getPromptContent(options);

    const connection = this.connection!;
    const sessionId = this.sessionId!;
    const client = this.client;
    const cleanup = () => this.cleanup();

    // Get a reference to the bound method
    const streamHandler = this.handleStreamNotification.bind(this);

    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      start: async (
        controller: ReadableStreamDefaultController<LanguageModelV2StreamPart>,
      ) => {
        controller.enqueue({ type: "stream-start", warnings: [] });

        // Reset stream state for this new stream
        this.resetStreamState();

        try {
          if (client) {
            client.setSessionUpdateHandler(
              (notification: SessionNotification) => {
                // Call the centralized handler
                streamHandler(controller, notification);
              },
            );
          }

          const response = await connection.prompt({
            sessionId,
            prompt: promptContent,
          });

          controller.enqueue({
            type: "finish",
            finishReason: response.stopReason === "end_turn" ? "stop" : "other",
            usage: {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
            },
          });

          controller.close();

          cleanup();
        } catch (error) {
          cleanup();
          controller.error(error);
        }
      },
      cancel: () => {
        cleanup();
      },
    });

    return { stream, warnings: [] as LanguageModelV2CallWarning[] };
  }

  /**
   * Defines the dynamic tool used to bridge ACP's agent-side tool calls
   * with the AI SDK's tool execution flow.
   */
  get tools(): Record<string, ReturnType<typeof tool>> {
    return {
      "acp.acp_agent_dynamic_tool": tool({
        name: "acp.acp_agent_dynamic_tool",
        type: "provider-defined",
        description:
          "A dynamic tool that represents an ACP agent tool call. This tool is called by the provider when an agent reports a tool call, and it resolves when the agent reports the tool's result.",
        inputSchema: jsonSchema({}),
        id: "acp.acp_agent_dynamic_tool",
        args: jsonSchema({}),
      }),
    };
  }

  get defaultObjectGenerationMode(): undefined {
    return undefined;
  }
}
