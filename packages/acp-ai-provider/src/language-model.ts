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
import { appendFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { Readable, Writable } from "node:stream";
import type { ACPProviderSettings } from "./types.ts";
import type { Tool, tool } from "ai";
import z from "zod";
import { formatToolError } from "./format-tool-error.ts";
import { ToolProxyHost } from "./tool-proxy/mod.ts";
import { getACPDynamicTool } from "./acp-tool.ts";
import {
  convertAiSdkMessagesToAcp,
  extractACPTools,
  type ToolsInput,
} from "./convert-utils.ts";

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
  args: z.record(z.unknown()).describe(
    "The input arguments for the tool call.",
  ),
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

  writeTextFile(_params: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    throw new Error("File operations not implemented in language model client");
  }

  readTextFile(_params: ReadTextFileRequest): Promise<ReadTextFileResponse> {
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
  private isFreshSession = true;

  // State for managing stream conversion
  private textBlockIndex = 0;
  private thinkBlockIndex = 0;
  private currentTextId: string | null = null;
  private currentThinkingId: string | null = null;
  private toolCallsMap = new Map<
    string,
    {
      index: number;
      name: string;
      inputStarted?: boolean;
      inputAvailable?: boolean;
    }
  >();

  // Tool proxy for host-side tool execution
  private toolProxyHost: ToolProxyHost | null = null;

  // Client tool interrupt mechanism
  private clientToolAbort: {
    controller: ReadableStreamDefaultController<LanguageModelV2StreamPart>;
    resolve: () => void;
  } | null = null;

  // Debug logging
  private debugLogFilePath: string | null = null;

  constructor(
    modelId: string | undefined,
    modeId: string | undefined,
    config: ACPProviderSettings,
  ) {
    this.modelId = modelId!;
    this.modeId = modeId;
    this.config = config;
    this.ensureDebugLogFile();
  }

  /**
   * Resets the internal state used for stream conversion.
   */
  private resetStreamState(): void {
    this.textBlockIndex = 0;
    this.thinkBlockIndex = 0;
    this.currentTextId = null;
    this.currentThinkingId = null; // Added this line to match state
    this.toolCallsMap.clear();
    this.clientToolAbort = null;
  }

  private isDebugEnabled(): boolean {
    const value = process.env.ACP_AI_PROVIDER_DEBUG;
    return value === "1" || value === "true";
  }

  private ensureDebugLogFile(): void {
    if (this.debugLogFilePath) {
      return;
    }

    if (!this.isDebugEnabled()) {
      return;
    }

    const debugDir = mkdtempSync(join(tmpdir(), "acp-ai-provider-"));
    this.debugLogFilePath = join(debugDir, "agent-messages.ndjson");

    // eslint-disable-next-line no-console
    console.log(
      `[acp-ai-provider] Agent message log: ${this.debugLogFilePath}`,
    );
  }

  private appendDebugAgentMessage(notification: SessionNotification): void {
    this.ensureDebugLogFile();
    if (!this.debugLogFilePath) {
      return;
    }

    try {
      appendFileSync(
        this.debugLogFilePath,
        `${
          JSON.stringify({
            timestamp: new Date().toISOString(),
            notification,
          })
        }\n`,
      );
    } catch {
      // Best-effort debug logging only.
    }
  }

  private hasToolInput(input: unknown): boolean {
    if (input === null || input === undefined) {
      return false;
    }
    if (typeof input === "object") {
      return Object.keys(input as object).length > 0;
    }
    if (typeof input === "string") {
      return input.length > 0;
    }
    return true;
  }

  private normalizeToolInput(input: unknown): unknown {
    return input ?? {};
  }

  /**
   * Parses a 'tool_call' notification update into a structured object.
   * Note: We only use rawInput for tool input (content is for UI display).
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
    // rawInput contains the actual tool parameters
    // content is for UI display (terminals, diffs, text) and should not be used as input
    const toolInput = update.rawInput ?? {};
    return { toolCallId, toolName, toolInput };
  }

  /**
   * Parses a 'tool_call_update' notification update into a structured object.
   * Note: We only use rawOutput for tool result (content is for UI display).
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
    // rawOutput contains the actual tool result
    // content is for UI display (terminals, diffs, text) and should not be used as result
    // caveat: rawOutput may be undefined for some agents
    const toolResult = update.rawOutput ?? update.content ?? null;
    const isError = update.status === "failed";
    return {
      toolCallId,
      toolName,
      toolResult: toolResult as unknown as ToolCallContent[],
      isError,
      status: update.status!,
    };
  }

  /**
   * Checks if a tool result is from a client-side tool (no execute function).
   * Client tools return a special response with `isClientTool: true`.
   * Handles both MCP format (type: "text") and ACP ToolCallContent format (type: "content").
   */
  private isClientToolResult(toolResult: unknown): {
    isClientTool: boolean;
    toolName?: string;
    args?: unknown;
  } {
    if (!Array.isArray(toolResult) || toolResult.length === 0) {
      return { isClientTool: false };
    }

    const content = toolResult[0] as Record<string, unknown>;
    if (!content?.type) {
      return { isClientTool: false };
    }

    // Extract text from MCP format: { type: "text", text: "..." }
    // or ACP format: { type: "content", content: { type: "text", text: "..." } }
    const textContent =
      content.type === "text" && typeof content.text === "string"
        ? content.text
        : content.type === "content" &&
            (content.content as Record<string, unknown>)?.type === "text"
        ? (content.content as Record<string, unknown>).text as string
        : undefined;

    if (!textContent) {
      return { isClientTool: false };
    }

    try {
      const parsed = JSON.parse(textContent);
      if (parsed.isClientTool === true) {
        return {
          isClientTool: true,
          toolName: parsed.toolName,
          args: parsed.args,
        };
      }
    } catch {
      // Not JSON or invalid format
    }
    return { isClientTool: false };
  }

  /**
   * Converts AI SDK prompt messages into ACP ContentBlock objects.
   * When session exists, only extracts the last user message (history is in session).
   * Prefixes text with role since ACP ContentBlock has no role field.
   */

  /**
   * Ensures the ACP agent process is running and a session is established.
   * @param acpTools - Tools from streamText options to proxy
   */
  /**
   * Connects to the ACP agent process and initializes the protocol connection.
   * Does NOT start a session.
   */
  async connectClient(): Promise<void> {
    if (this.connection) {
      return;
    }

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

      const input = Writable.toWeb(this.agentProcess.stdin) as WritableStream<
        Uint8Array
      >;
      const output = Readable.toWeb(this.agentProcess.stdout) as ReadableStream<
        Uint8Array
      >;

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
      ...this.config.initialize,
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

    if ((initResult.authMethods?.length ?? 0) > 0) {
      if (!this.config.authMethodId || !validAuthMethods) {
        console.log(
          "[acp-ai-provider] Warning: No authMethodId specified in config, skipping authentication step. If this is not desired, please set one of the authMethodId in the ACPProviderSettings.",
          JSON.stringify(initResult.authMethods, null, 2),
        );
      }

      // Some agents never implement authentication, so we skip this unless user specifies it.
      if (this.config.authMethodId && validAuthMethods) {
        await this.connection.authenticate({
          methodId: this.config.authMethodId ?? initResult.authMethods?.[0].id!,
        });
      }
    }
  }

  /**
   * Starts a new session or updates the existing one.
   * Assumes connectClient() has been called.
   */
  async startSession(
    acpTools?: Array<Tool<any, any> & { name: string }>,
  ): Promise<void> {
    if (!this.connection) {
      throw new Error("Not connected");
    }

    // Prepare MCP servers list foundation
    const mcpServers = [...(this.config.session?.mcpServers ?? [])];
    let toolsAdded = false;

    // Set up tool proxy if tools are present and proxy doesn't exist
    if (acpTools && acpTools.length > 0 && !this.toolProxyHost) {
      console.log(
        "[acp-ai-provider] Setting up tool proxy for client-side tools...",
        acpTools.map((t) => t.name),
      );
      this.toolProxyHost = new ToolProxyHost("acp-ai-sdk-tools");
      for (const t of acpTools) {
        this.toolProxyHost.registerTool(t.name, t);
      }
      toolsAdded = true;
    }

    // Always include proxy config if host is initialized
    // This starts the server if needed and ensures we don't drop the proxy when updating session
    if (this.toolProxyHost) {
      const proxyConfig = await this.toolProxyHost.start();
      mcpServers.push(proxyConfig);
    }

    // Check if we need to update existing session (e.g. to enable tools)
    if (this.sessionId && toolsAdded) {
      this.sessionResponse = await this.connection.newSession({
        ...this.config.session,
        cwd: this.config.session?.cwd ?? process.cwd(),
        mcpServers,
      });
      this.sessionId = this.sessionResponse.sessionId;
      // Treat as fresh since we are establishing a new session.
      this.isFreshSession = true;

      await this.applySessionDelay();
      return;
    }

    // If session already exists and we didn't just update it, do nothing
    if (this.sessionId) {
      return;
    }

    // Start a fresh session
    if (this.config.existingSessionId) {
      // Note: loadSession typically assumes servers are already known or config is separate?
      // Protocol says loadSession usually just resumes.
      // But if we want to Add tools to a loaded session, we might need newSession logic?
      // For now, preserving original logic: loadSession takes mcpServers.
      await this.connection.loadSession({
        sessionId: this.config.existingSessionId,
        cwd: this.config.session?.cwd ?? process.cwd(),
        mcpServers,
      });
      this.sessionId = this.config.existingSessionId;
      this.sessionResponse = { sessionId: this.config.existingSessionId };
      this.isFreshSession = false;
    } else {
      this.sessionResponse = await this.connection.newSession({
        ...this.config.session,
        cwd: this.config.session?.cwd ?? process.cwd(),
        mcpServers,
      });
      this.sessionId = this.sessionResponse.sessionId;
      this.isFreshSession = true;
    }

    // Init models/modes after session creation
    const { models, modes } = this.sessionResponse ?? {};

    if (models?.currentModelId) {
      this.currentModelId = models.currentModelId;
    }
    if (modes?.currentModeId) {
      this.currentModeId = modes.currentModeId;
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

    await this.applySessionDelay();
  }

  private async applySessionDelay() {
    if (this.config.sessionDelayMs) {
      console.log(
        `[acp-ai-provider] Waiting ${this.config.sessionDelayMs}ms after session setup...`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, this.config.sessionDelayMs)
      );
    }
  }

  /**
   * Ensures the ACP agent process is running and a session is established.
   * @param acpTools - Tools from streamText options to proxy
   */
  private async ensureConnected(
    acpTools?: Array<Tool<any, any> & { name: string }>,
  ): Promise<void> {
    await this.connectClient();
    await this.startSession(acpTools);
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
  /**
   * Initializes the session and returns session info (models, modes, meta).
   * Call this before prompting to discover available options.
   *
   * @param acpTools - Optional list of tools to register during session initialization.
   */
  async initSession(tools?: ToolsInput): Promise<NewSessionResponse> {
    // This ensures tools have registered execute handlers attached
    const acpTools = extractACPTools(tools, false);

    await this.ensureConnected(acpTools.length > 0 ? acpTools : undefined);
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
   * Emits raw content (plan, diffs, terminals) as raw stream parts.
   * Plan data is emitted directly, while diffs and terminals are bound to a toolCallId.
   */
  private emitRawContent(
    controller: ReadableStreamDefaultController<LanguageModelV2StreamPart>,
    data:
      | { type: "plan"; entries: unknown }
      | {
        content: ToolCallContent[];
        toolCallId: string;
      },
  ): void {
    if ("entries" in data) {
      // Plan data
      controller.enqueue({
        type: "raw",
        rawValue: JSON.stringify({ type: "plan", entries: data.entries }),
      });
      return;
    }

    // Tool call content (diffs, terminals)
    for (const item of data.content) {
      if (item.type === "diff" || item.type === "terminal") {
        controller.enqueue({
          type: "raw",
          rawValue: JSON.stringify({ ...item, toolCallId: data.toolCallId }),
        });
      }
    }
  }

  /**
   * Flushes any pending tool calls that haven't emitted tool-call yet.
   * This handles the case where a tool emits {} first, then the next message is a different type.
   */
  private flushPendingToolCalls(
    controller: ReadableStreamDefaultController<LanguageModelV2StreamPart>,
  ): void {
    for (const [toolCallId, toolInfo] of this.toolCallsMap.entries()) {
      if (!toolInfo.inputAvailable) {
        // This tool call hasn't been emitted yet
        toolInfo.inputAvailable = true;
        controller.enqueue({
          type: "tool-call",
          toolCallId,
          toolName: ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME,
          input: JSON.stringify({
            toolCallId,
            toolName: toolInfo.name,
            args: {},
          }),
        });
      }
    }
  }

  /**
   * Standardized handler for converting SessionNotifications into
   * LanguageModelV2StreamPart objects, pushing them onto a stream controller.
   */
  private handleStreamNotification(
    controller: ReadableStreamDefaultController<LanguageModelV2StreamPart>,
    notification: SessionNotification,
  ): void {
    this.appendDebugAgentMessage(notification);
    const update = notification.update;
    switch (update.sessionUpdate) {
      case "plan":
        this.flushPendingToolCalls(controller);
        this.emitRawContent(controller, {
          type: "plan",
          entries: update.entries,
        });
        break;
      case "agent_thought_chunk":
        this.flushPendingToolCalls(controller);
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
        this.flushPendingToolCalls(controller);
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

        const existingToolCall = this.toolCallsMap.get(toolCallId);

        // Check if rawInput has actual data (not empty object)
        const hasInput = toolInput && typeof toolInput === "object" &&
          Object.keys(toolInput as object).length > 0;

        if (!existingToolCall) {
          // First time seeing this toolCallId
          this.toolCallsMap.set(toolCallId, {
            index: this.toolCallsMap.size,
            name: toolName,
            inputStarted: true,
            inputAvailable: !!hasInput,
          });

          // Emit tool-input-start when we first see the tool call
          controller.enqueue({
            type: "tool-input-start",
            id: toolCallId,
            toolName,
          });

          // If rawInput is already populated, emit tool-call immediately
          if (hasInput) {
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
          }
        } else if (!existingToolCall.inputAvailable && hasInput) {
          // We previously got tool-input-start, now we have the actual input
          existingToolCall.inputAvailable = true;

          // Update the stored name if we now have a better one (title vs toolCallId)
          if (
            update.title &&
            existingToolCall.name !== update.title &&
            update.title !== toolCallId
          ) {
            existingToolCall.name = update.title;
          }

          controller.enqueue({
            type: "tool-call",
            toolCallId,
            toolName: ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME,
            input: JSON.stringify({
              toolCallId,
              toolName: existingToolCall.name,
              args: toolInput,
            }),
          });
        }
        // If inputAvailable is already true, ignore duplicate notifications
        break;
      }

      case "tool_call_update": {
        const { toolCallId, toolName, toolResult, isError } = this
          .parseToolResult(update);
        const effectiveStatus = update.status ?? "in_progress";

        let toolInfo = this.toolCallsMap.get(toolCallId);
        // ACP allows incremental tool updates and rawInput can be provided on
        // tool_call_update (not only on the initial tool_call), so we must
        // recover args from update.rawInput when available.
        const updateInput = this.normalizeToolInput(
          "rawInput" in update ? update.rawInput : undefined,
        );

        // On in_progress: emit tool-call if we haven't already.
        // This keeps AI SDK tool-call payloads stable even when the agent
        // sends args later via tool_call_update.
        if (effectiveStatus === "in_progress") {
          if (!toolInfo) {
            // First time seeing this toolCallId
            toolInfo = {
              index: this.toolCallsMap.size,
              name: toolName,
              inputStarted: true,
              inputAvailable: false,
            };
            this.toolCallsMap.set(toolCallId, toolInfo);
            controller.enqueue({
              type: "tool-input-start",
              id: toolCallId,
              toolName,
            });
          }

          // Emit tool-call if input wasn't available before, or if we have new input data
          // (handles case where tool_call notification had empty args but tool_call_update has rawInput)
          const hasNewInput = this.hasToolInput(updateInput);
          if (!toolInfo.inputAvailable || hasNewInput) {
            // Input is now available (either wasn't before, or we got new data from update)
            toolInfo.inputAvailable = true;

            // Update the stored name if we now have a better one (title vs toolCallId)
            if (
              update.title && toolInfo.name !== update.title &&
              update.title !== toolCallId
            ) {
              toolInfo.name = update.title;
            }

            controller.enqueue({
              type: "tool-call",
              toolCallId,
              toolName: ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME,
              input: JSON.stringify({
                toolCallId,
                toolName: toolInfo.name,
                args: updateInput,
              }),
            });
          }

          const content = update.content ?? [];
          if (content.length > 0) {
            this.emitRawContent(controller, { content, toolCallId });
          }
          break;
        }

        if (!["completed", "failed"].includes(effectiveStatus)) {
          // Ignore other intermediate statuses (e.g., pending)
          break;
        }

        if (!toolInfo) {
          // This can happen if all tool_call/in_progress notifications were missed
          toolInfo = {
            index: this.toolCallsMap.size,
            name: toolName,
            inputAvailable: true,
          };
          this.toolCallsMap.set(toolCallId, toolInfo);
          controller.enqueue({
            type: "tool-call",
            toolCallId,
            toolName: ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME,
            input: JSON.stringify({ toolCallId, toolName, args: updateInput }),
          });
        } else {
          // Emit tool-call if input wasn't available before, or if we have new input data
          const hasNewInput = this.hasToolInput(updateInput);
          if (!toolInfo.inputAvailable || hasNewInput) {
            // Input is now available (either wasn't before, or we got new data from update)
            toolInfo.inputAvailable = true;

            // Update the stored name if we now have a better one (title vs toolCallId)
            if (
              update.title && toolInfo.name !== update.title &&
              update.title !== toolCallId
            ) {
              toolInfo.name = update.title;
            }

            controller.enqueue({
              type: "tool-call",
              toolCallId,
              toolName: ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME,
              input: JSON.stringify({
                toolCallId,
                toolName: toolInfo.name,
                args: updateInput,
              }),
            });
          }
        }

        // Check if this is a client-side tool (no execute function)
        const clientToolInfo = this.isClientToolResult(toolResult);
        if (clientToolInfo.isClientTool) {
          // For client tools, we need to STOP the stream immediately
          // The client application must handle the tool execution
          // and submit the result in a subsequent request
          console.log(
            `[acp-ai-provider] Detected client tool: ${clientToolInfo.toolName}, stopping stream`,
          );

          // Emit the content if any (for UI purposes)
          const content = update.content ?? [];
          if (content.length > 0) {
            this.emitRawContent(controller, { content, toolCallId });
          }

          // Trigger stream termination - this will resolve the prompt() call
          // and close the stream with 'tool-calls' finish reason
          if (this.clientToolAbort) {
            // Emit finish with 'tool-calls' reason to indicate pending client tool
            controller.enqueue({
              type: "finish",
              finishReason: "tool-calls",
              usage: {
                inputTokens: undefined,
                outputTokens: undefined,
                totalTokens: undefined,
              },
            });
            controller.close();
            this.clientToolAbort.resolve();
            this.cleanup();
          }
          // Skip emitting tool-result for client tools
          break;
        }

        // Send the tool result (for server-side tools)
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

        const content = update.content ?? [];
        if (content.length > 0) {
          this.emitRawContent(controller, { content, toolCallId });
        }
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
      /*
        If we just created the session (isFreshSession=true), we send full prompt.
        If we reused it, we send filtered prompt.
        After sending, we are no longer "fresh" for subsequent calls on this instance.
      */
      const promptContent = convertAiSdkMessagesToAcp(
        options,
        this.isFreshSession,
      );
      this.isFreshSession = false;

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
              const matchingToolCall = toolCalls.find((tc) =>
                tc.id === part.toolCallId
              );
              toolResults.set(part.toolCallId, {
                name: matchingToolCall?.name || part.toolCallId,
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
    const acpTools = extractACPTools(options.tools);

    // Now connect with the registered tools
    await this.ensureConnected(acpTools.length > 0 ? acpTools : undefined);

    /*
      If we just created the session (isFreshSession=true), we send full prompt.
      If we reused it, we send filtered prompt.
      After sending, we are no longer "fresh" for subsequent calls on this instance.
    */
    const promptContent = convertAiSdkMessagesToAcp(
      options,
      this.isFreshSession,
    );
    this.isFreshSession = false;

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

        // Set up client tool abort mechanism
        const clientToolPromise = new Promise<void>((resolve) => {
          this.clientToolAbort = { controller, resolve };
        });

        try {
          if (client) {
            client.setSessionUpdateHandler(
              (notification: SessionNotification) => {
                // Call the centralized handler
                streamHandler(controller, notification);
              },
            );
          }

          // Race between normal completion and client tool abort
          const promptPromise = connection.prompt({
            sessionId,
            prompt: promptContent,
          });

          const result = await Promise.race([
            promptPromise.then((response) => ({
              type: "response" as const,
              response,
            })),
            clientToolPromise.then(() => ({ type: "client-tool" as const })),
          ]);

          // If client tool was detected, stream is already closed
          if (result.type === "client-tool") {
            return;
          }

          // Normal completion
          const response = result.response;
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
