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
  type NewSessionResponse,
  PROTOCOL_VERSION,
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type ToolCallContent,
  type ToolCallStatus,
  type WriteTextFileRequest,
  type WriteTextFileResponse,
} from "@agentclientprotocol/sdk";
import { type ChildProcess, spawn } from "node:child_process";
import process from "node:process";
import { Readable, Writable } from "node:stream";
import type { ACPProviderSettings } from "./types.ts";
import type { Tool, tool } from "ai";
import z from "zod";
import { formatToolError } from "./format-tool-error.ts";
import { extractBase64Data } from "./utils.ts";
import { ToolProxyHost } from "./tool-proxy/mod.ts";
import {
  getACPDynamicTool,
  getExecuteByName,
  hasRegisteredExecute,
} from "./acp-tool.ts";

/**
 * The name of the provider tool used to represent ACP agent tool calls.
 */
export const ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME =
  "acp.acp_provider_agent_dynamic_tool";

export type ProviderAgentDynamicToolInput = {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
};

export const providerAgentDynamicToolSchema: z.ZodType<
  ProviderAgentDynamicToolInput
> = z.object({
  toolCallId: z.string().describe("The unique ID of the tool call."),
  toolName: z.string().describe("The name of the tool being called."),
  args: z
    .record(z.unknown())
    .describe("The input arguments for the tool call."),
});

/**
 * Implements the ACP client-side logic for handling file operations and permissions.
 * This basic implementation throws errors for file ops and auto-allows permissions.
 *
 * @see https://agentclientprotocol.com
 */
export class ACPAISDKClient implements Client {
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
 *
 * @see https://ai-sdk.dev/providers/community-providers/custom-providers#reasoning
 */
export class ACPLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = "v2" as const;
  readonly provider = "acp";
  modelId: string;
  modeId?: string;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  private config: ACPProviderSettings;
  private agentProcess: ChildProcess | null = null;
  private connection: ClientSideConnection | null = null;
  private sessionId: string | null = null;
  private sessionResponse: NewSessionResponse | null = null;
  private client: ACPAISDKClient | null = null;
  private currentModelId: string | null = null;
  private currentModeId: string | null = null;

  // State for managing stream conversion
  private textBlockIndex = 0;
  private thinkBlockIndex = 0;
  private currentTextId: string | null = null;
  private currentThinkingId: string | null = null;
  private toolCallsMap = new Map<string, { index: number; name: string }>();

  // Tool proxy for host-side tool execution
  private toolProxyHost: ToolProxyHost | null = null;

  constructor(
    modelId: string | undefined,
    modeId: string | undefined,
    config: ACPProviderSettings,
  ) {
    this.modelId = modelId!;
    this.modeId = modeId;
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
  private parseToolCall(update: SessionNotification["update"]): {
    toolCallId: string;
    toolName: string;
    toolInput: unknown;
  } {
    if (update.sessionUpdate !== "tool_call") {
      throw new Error("Invalid update type for parseToolCall");
    }

    const toolCallId = update.toolCallId;
    const toolName = update.title || update.toolCallId;
    let toolInput: unknown = {};
    if (update.content && update.content.length > 0) {
      toolInput = update.content;
    } else if (update.rawInput) {
      toolInput = update.rawInput;
    }
    return { toolCallId, toolName, toolInput };
  }

  /**
   * Parses a 'tool_call_update' notification update into a structured object.
   */
  private parseToolResult(update: SessionNotification["update"]): {
    toolCallId: string;
    toolName: string;
    toolResult: ToolCallContent[];
    isError: boolean;
    status: ToolCallStatus;
  } {
    if (update.sessionUpdate !== "tool_call_update") {
      throw new Error("Invalid update type for parseToolResult");
    }
    const toolCallId = update.toolCallId;
    const toolName = update.title || update.toolCallId;
    let toolResult: unknown = null;
    if (update.content && update.content.length > 0) {
      toolResult = update.content;
    } else if (update.rawOutput) {
      toolResult = update.rawOutput;
    }
    const isError = update.status === "failed";
    return {
      toolCallId,
      toolName,
      toolResult: toolResult as ToolCallContent[],
      isError,
      status: update.status!,
    };
  }

  /**
   * Converts AI SDK prompt messages into ACP ContentBlock objects.
   * When session exists, only extracts the last user message (history is in session).
   * Prefixes text with role since ACP ContentBlock has no role field.
   */
  private getPromptContent(
    options: LanguageModelV2CallOptions,
  ): ContentBlock[] {
    // With persistent session, only send the latest user message
    const messages = this.sessionId
      ? options.prompt.filter((m) => m.role === "user").slice(-1)
      : options.prompt;

    const contentBlocks: ContentBlock[] = [];

    for (const msg of messages) {
      // Skip tool role - ACP handles tool results internally
      if (msg.role === "tool") continue;

      // Prefix to identify role since ACP has no role field
      const prefix = msg.role === "system"
        ? "System: "
        : msg.role === "assistant"
        ? "Assistant: "
        : "";

      if (Array.isArray(msg.content)) {
        let isFirst = true;
        for (const part of msg.content) {
          if (part.type === "text") {
            const text = isFirst ? `${prefix}${part.text} ` : part.text;
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
   * Ensures the ACP agent process is running and a session is established.
   * @param acpTools - Tools from streamText options to proxy
   */
  private async ensureConnected(
    acpTools?: Array<Tool<any, any> & { name: string }>,
  ): Promise<void> {
    if (!this.connection || !this.sessionId) {
      if (!this.agentProcess) {
        const sessionCwd = this.config.session?.cwd ||
          (typeof process.cwd === "function" ? process.cwd() : "/");

        this.agentProcess = spawn(this.config.command, this.config.args ?? [], {
          stdio: ["pipe", "pipe", "inherit"],
          env: { ...process.env, ...this.config.env },
          cwd: sessionCwd,
        });

        if (!this.agentProcess.stdout || !this.agentProcess.stdin) {
          throw new Error("Failed to spawn agent process with stdio");
        }

        const input = Writable.toWeb(this.agentProcess.stdin);
        const output = Readable.toWeb(
          this.agentProcess.stdout,
        ) as ReadableStream<Uint8Array>;

        this.client = new ACPAISDKClient();

        this.connection = new ClientSideConnection(
          () => this.client!,
          ndJsonStream(input, output),
        );
      }

      if (!this.connection) {
        throw new Error("Connection not initialized");
      }

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
      const validAuthMethods = initResult.authMethods?.find(
        (a) => a.id === this.config.authMethodId,
      )?.id;

      if (initResult.authMethods?.length ?? 0 > 0) {
        if (!this.config.authMethodId || !validAuthMethods) {
          console.log(
            "⚠️ Warning: No authMethodId specified in config, skipping authentication step. If this is not desired, please set one of the authMethodId in the ACPProviderSettings.",
            JSON.stringify(initResult.authMethods, null, 2),
          );
        }

        // Some agents never implement authentication, so we skip this unless user specifies it.
        if (this.config.authMethodId && validAuthMethods) {
          await this.connection.authenticate({
            methodId: this.config.authMethodId ??
              initResult.authMethods?.[0].id!,
          });
        }
      } else {
        console.log(
          `⚠️ No authentication methods required by the ACP agent, skipping authentication step.`,
        );
      }

      // Prepare MCP servers list, potentially including tool proxy
      const mcpServers = [...(this.config.session?.mcpServers ?? [])];

      // If ACP tools are provided (from streamText options), start tool proxy
      if (acpTools && acpTools.length > 0) {
        this.toolProxyHost = new ToolProxyHost("acp-ai-sdk-tools");
        for (const t of acpTools) {
          // Register the Tool with its name
          this.toolProxyHost.registerTool(t.name, t);
        }
        const proxyConfig = await this.toolProxyHost.start();
        mcpServers.push(proxyConfig);
      }

      if (this.config.existingSessionId) {
        await this.connection.loadSession({
          sessionId: this.config.existingSessionId,
          cwd: this.config.session?.cwd ?? process.cwd(),
          mcpServers,
        });
        this.sessionId = this.config.existingSessionId;
        this.sessionResponse = { sessionId: this.config.existingSessionId };
      } else {
        this.sessionResponse = await this.connection.newSession({
          ...this.config.session,
          cwd: this.config.session?.cwd ?? process.cwd(),
          mcpServers,
        });
        this.sessionId = this.sessionResponse.sessionId;
      }
    }

    const { models, modes } = this.sessionResponse ?? {};

    if (models?.currentModelId) {
      this.currentModelId = models.currentModelId;
    }
    if (modes?.currentModeId) {
      this.currentModeId = modes.currentModeId; // Assuming currentModeId exists on modes
    }

    // Update model if needed
    if (this.modelId && this.modelId !== this.currentModelId) {
      await this.setModel(this.modelId);
      this.currentModelId = this.modelId;
    }

    // Update mode if needed
    if (this.modeId && this.modeId !== this.currentModeId) {
      await this.setMode(this.modeId);
      this.currentModeId = this.modeId;
    }
  }

  /**
   * Clears connection state. Skips if persistSession is enabled.
   */
  private cleanup(): void {
    if (this.config.persistSession) return;
    this.forceCleanup();
  }

  /**
   * Returns the current session ID.
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Initializes the session and returns session info (models, modes, meta).
   * Call this before prompting to discover available options.
   */
  async initSession(): Promise<NewSessionResponse> {
    await this.ensureConnected();
    return this.sessionResponse!;
  }

  /**
   * Sets the session mode (e.g., "ask", "plan").
   */
  async setMode(modeId: string): Promise<void> {
    if (!this.connection || !this.sessionId) {
      throw new Error("Not connected. Call preconnect() first.");
    }

    const availableModes = this.sessionResponse?.modes?.availableModes;
    if (availableModes) {
      const foundMode = availableModes.find((m) => m.id === modeId);
      if (!foundMode) {
        const availableList = availableModes.map((m) => m.id).join(", ");
        const currentInfo = this.sessionResponse?.modes?.currentModeId
          ? ` (Current: "${this.sessionResponse.modes.currentModeId}")`
          : "";

        throw new Error(
          `Mode "${modeId}" is not available${currentInfo}. Available modes: ${availableList}`,
        );
      }
    }

    await this.connection.setSessionMode({ sessionId: this.sessionId, modeId });
    this.currentModeId = modeId;
  }

  /**
   * Sets the session model.
   */
  async setModel(modelId: string): Promise<void> {
    if (!this.connection || !this.sessionId) {
      throw new Error("Not connected. Call preconnect() first.");
    }

    const { models } = this.sessionResponse ?? {};
    if (models?.availableModels) {
      if (!models.availableModels.some((m) => m.modelId === modelId)) {
        const availableList = models.availableModels.map((m) => m.modelId).join(
          ", ",
        );
        const currentInfo = this.currentModelId
          ? ` (Current: "${this.currentModelId}")`
          : "";

        throw new Error(
          `Model "${modelId}" is not available${currentInfo}. Available models: ${availableList}`,
        );
      }
    }

    await this.connection.setSessionModel({
      sessionId: this.sessionId,
      modelId,
    });
    this.currentModelId = modelId;
  }

  /**
   * Forces cleanup regardless of persistSession setting.
   */
  forceCleanup(): void {
    // Stop tool proxy if running
    if (this.toolProxyHost) {
      this.toolProxyHost.stop();
      this.toolProxyHost = null;
    }

    if (this.agentProcess) {
      this.agentProcess.kill();
      this.agentProcess.stdin?.end();
      this.agentProcess.stdout?.destroy();
      this.agentProcess = null;
    }
    this.connection = null;
    this.sessionId = null;
    this.sessionResponse = null;
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
          this.currentThinkingId = `reasoning - ${this.thinkBlockIndex++} `;
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
        break;

      case "agent_message_chunk":
        if (this.currentThinkingId) {
          controller.enqueue({
            type: "reasoning-end",
            id: this.currentThinkingId,
          });
          this.currentThinkingId = null;
        }

        if (update.content.type === "text") {
          const textChunk = update.content.text;
          if (!this.currentTextId) {
            this.currentTextId = `text - ${this.textBlockIndex++} `;
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
        }
        break;

      case "tool_call": {
        // Close current text/thinking block when tool call starts
        if (this.currentTextId) {
          controller.enqueue({
            type: "text-end",
            id: this.currentTextId,
          });
          this.currentTextId = null;
        }
        if (this.currentThinkingId) {
          controller.enqueue({
            type: "reasoning-end",
            id: this.currentThinkingId,
          });
          this.currentThinkingId = null;
        }

        const { toolCallId, toolName, toolInput } = this.parseToolCall(update);

        // We tell the AI SDK to call our "dynamic tool", passing the
        // *actual* tool info inside the input.
        controller.enqueue({
          type: "tool-call",
          toolCallId,
          toolName: ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME,
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

        if (!["completed", "failed"].includes(status)) {
          // Ignore intermediate updates, ai sdk currently doesn't support streaming tool results,
          // see -> https://github.com/vercel/ai/issues/9306
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
            toolName: ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME,
            input: JSON.stringify({ toolCallId, toolName }), // Note: input args are missing
          });
        }

        // Send the tool result
        controller.enqueue({
          type: "tool-result",
          toolCallId,
          toolName: ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME,
          result: toolResult,
          providerExecuted: true,
          // https://github.com/vercel/ai/blob/282f062922cb59167dd3a11e3af67cfa0b75f317/packages/ai/src/generate-text/run-tools-transformation.ts#L316
          ...(isError && {
            isError: true,
            result: new Error(formatToolError(toolResult)),
          }),
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
              // handleStreamNotification maps the real tool to ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME
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
                name: matchingToolCall?.name || matchingToolCall?.id!,
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
    // IMPORTANT: Extract and register ACP tools BEFORE ensureConnected
    // This ensures Tool Proxy can discover them when it starts
    const acpTools: Array<Tool<any, any> & { name: string }> = [];

    // Check options.tools for ACP tools with registered execute
    if (options.tools) {
      for (const t of options.tools) {
        if (t.type === "function") {
          // AI SDK internally converts parameters to inputSchema
          const toolWithSchema = t as Record<string, unknown>;
          const toolInputSchema = toolWithSchema.inputSchema as
            | Record<
              string,
              unknown
            >
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
    }

    // Now connect with the registered tools
    await this.ensureConnected(acpTools.length > 0 ? acpTools : undefined);
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
          controller.enqueue({
            type: "error",
            error: error,
          });
        }
      },
      cancel: () => {
        cleanup();
      },
    });

    return { stream, warnings: [] as LanguageModelV2CallWarning[] };
  }

  get tools(): Record<string, ReturnType<typeof tool>> {
    return getACPDynamicTool();
  }
}
