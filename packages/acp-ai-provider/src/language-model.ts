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
import type { ReasoningOutput } from "ai";

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
  // Map of pending toolCallId => [resolve, reject] for the promise returned by the dynamic tool
  private toolCallbacks: Record<
    string,
    [(value?: unknown) => void, (reason?: any) => void]
  > = {};

  constructor(modelId: string, config: ACPProviderSettings) {
    this.modelId = modelId;
    this.config = config;
  }

  // Converts AI SDK prompt format to ACP ContentBlock[]
  // See: https://agentclientprotocol.com/protocol/content
  private getPromptContent(
    options: LanguageModelV2CallOptions,
  ): ContentBlock[] {
    const contentBlocks: ContentBlock[] = [];

    for (const msg of options.prompt) {
      let prefix = "";
      if (msg.role === "system") {
        prefix = "System: ";
      } else if (msg.role === "user") {
        prefix = "User: ";
      } else if (msg.role === "assistant") {
        prefix = "Assistant: ";
      }

      if (msg.role === "system") {
        contentBlocks.push({
          type: "text" as const,
          text: `${prefix}${msg.content}`,
        });
      } else if (msg.role === "user" || msg.role === "assistant") {
        if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === "text") {
              contentBlocks.push({
                type: "text" as const,
                text: `${prefix}${part.text}`,
              });
              prefix = "";
            }
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

  private cleanup(): void {
    if (this.agentProcess) {
      this.agentProcess.kill();
      this.agentProcess = null;
    }
    this.connection = null;
    this.sessionId = null;
    this.client = null;
  }

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

      const _reasonings: Array<ReasoningOutput> = [];

      if (this.client) {
        this.client.setSessionUpdateHandler((notification) => {
          const update = notification.update;
          switch (update.sessionUpdate) {
            case "plan":
              console.log(
                "Plan update received:",
                JSON.stringify(update, null, 2),
              );
              break;
            case "agent_thought_chunk":
              console.log(
                "Thought chunk received:",
                JSON.stringify(update, null, 2),
              );
              break;
            case "agent_message_chunk":
              if (update.content.type === "text") {
                accumulatedText += update.content.text;
              }
              break;

            case "tool_call": {
              let toolInput = {};
              if (update.rawInput) {
                toolInput = update.rawInput;
              } else if (update.content && update.content.length > 0) {
                const firstContent = update.content[0];
                if ("content" in firstContent && firstContent.content) {
                  toolInput = firstContent.content;
                }
              }

              toolCalls.push({
                id: update.toolCallId,
                name: update.title || "unknown-tool",
                input: toolInput,
              });
              break;
            }

            case "tool_call_update": {
              let toolResult: unknown = null;
              if (update.rawOutput) {
                toolResult = update.rawOutput;
              } else if (update.content && update.content.length > 0) {
                const firstContent = update.content[0];
                if ("content" in firstContent && firstContent.content) {
                  toolResult = firstContent.content;
                }
              }

              let toolCall = toolCalls.find(
                (tc) => tc.id === update.toolCallId,
              );

              if (!toolCall) {
                toolCall = {
                  id: update.toolCallId,
                  name: update.title || "unknown-tool",
                  input: {},
                };
                toolCalls.push(toolCall);
              }

              toolResults.set(update.toolCallId, {
                name: toolCall.name,
                result: toolResult,
                isError: update.status === "failed",
              });

              // If there's a pending promise for this tool call, resolve or reject it
              const pending = this.toolCallbacks[update.toolCallId];
              if (pending && pending.length === 2) {
                const [resolve, reject] = pending;
                try {
                  if (update.status === "failed") {
                    reject(
                      new Error(
                        `Tool call ${update.toolCallId} failed: ${
                          JSON.stringify(toolResult)
                        }`,
                      ),
                    );
                  } else {
                    resolve(toolResult);
                  }
                } finally {
                  delete this.toolCallbacks[update.toolCallId];
                }
              }
              break;
            }
          }
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

    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      async start(controller) {
        controller.enqueue({ type: "stream-start", warnings: [] });
        try {
          // Track text block index for unique IDs
          let textBlockIndex = 0;
          // Current active text block ID
          let currentTextId: string | null = null;
          let toolCallIndex: number = -1;
          const toolCallsMap = new Map<
            string,
            { index: number; name: string }
          >();

          if (client) {
            client.setSessionUpdateHandler(
              (notification: SessionNotification) => {
                const update = notification.update;

                switch (update.sessionUpdate) {
                  case "agent_thought_chunk":
                    // Optional: Handle thought chunks if needed

                    break;
                  case "agent_message_chunk":
                    if (update.content.type === "text") {
                      const textChunk = update.content.text;

                      if (!currentTextId) {
                        currentTextId = `text-${textBlockIndex++}`;
                        controller.enqueue({
                          type: "text-start",
                          id: currentTextId,
                        });
                      }
                      controller.enqueue({
                        type: "text-delta",
                        id: currentTextId,
                        delta: textChunk,
                      });
                    }
                    break;

                  case "tool_call": {
                    toolCallIndex += 1;
                    // Close current text block when tool call starts
                    if (currentTextId) {
                      currentTextId = null;
                    }
                    const toolCallId = update.toolCallId + toolCallIndex;
                    const toolName = update.title || "unknown-tool";

                    let _toolInput: unknown = {};
                    if (update.rawInput) {
                      _toolInput = update.rawInput;
                    } else if (update.content && update.content.length > 0) {
                      const firstContent = update.content[0];
                      if ("content" in firstContent && firstContent.content) {
                        _toolInput = firstContent.content;
                      }
                    }

                    controller.enqueue({
                      type: "tool-call",
                      toolCallId,
                      toolName: "acp.acp_agent_dynamic_tool",
                      input: JSON.stringify({
                        toolCallId,
                        toolName,
                        args: _toolInput,
                      }),
                    });

                    toolCallsMap.set(toolCallId, {
                      index: toolCallsMap.size,
                      name: toolName,
                    });
                    break;
                  }

                  case "tool_call_update": {
                    const toolCallId = update.toolCallId + toolCallIndex;
                    let toolInfo = toolCallsMap.get(toolCallId);

                    if (!toolInfo) {
                      const toolCallId = update.toolCallId + toolCallIndex;
                      const toolName = update.title || "unknown-tool";
                      toolInfo = {
                        index: toolCallsMap.size,
                        name: toolName,
                      };
                      toolCallsMap.set(toolCallId, toolInfo);
                      toolCallIndex += 1;
                      controller.enqueue({
                        type: "tool-call",
                        toolCallId,
                        toolName: "acp.acp_agent_dynamic_tool",
                        input: JSON.stringify({ toolCallId, toolName }),
                      });
                    }

                    let _toolResult: unknown = null;
                    if (update.rawOutput) {
                      _toolResult = update.rawOutput;
                    } else if (update.content && update.content.length > 0) {
                      const firstContent = update.content[0];
                      if ("content" in firstContent && firstContent.content) {
                        _toolResult = firstContent.content;
                      }
                    }

                    toolCallsMap.delete(toolCallId);
                    controller.enqueue({
                      type: "tool-result",
                      toolCallId,
                      toolName: "acp.acp_agent_dynamic_tool",
                      result: _toolResult,
                      ...(update.status === "failed" && { isError: true }),
                    });
                    toolCallIndex += 1;

                    break;
                  }
                }
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
      cancel() {
        cleanup();
      },
    });

    return { stream, warnings: [] as LanguageModelV2CallWarning[] };
  }

  get tools(): Record<string, ReturnType<typeof tool>> {
    return {
      "acp.acp_agent_dynamic_tool": tool({
        name: "acp.acp_agent_dynamic_tool",
        description: "A dynamic tool that represents an ACP agent tool call.",
        inputSchema: jsonSchema({
          type: "object",
          properties: {
            toolCallId: {
              type: "string",
              description: "The unique ID of the tool call.",
            },
          },
          required: ["toolCallId"],
        }),
        // @ts-expect-error - generic tool execute implementation
        execute: ({ toolCallId }) => {
          return new Promise((resolve, reject) => {
            // store the resolve/reject pair so the ACP session update handler can fulfill it later
            this.toolCallbacks[toolCallId] = [resolve, reject];
          });
        },
      }),
    };
  }
  get defaultObjectGenerationMode(): undefined {
    return undefined;
  }
}
