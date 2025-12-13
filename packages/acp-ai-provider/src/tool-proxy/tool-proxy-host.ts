/**
 * Tool Proxy Host
 *
 * Host-side manager that starts a TCP server to handle tool execution requests.
 * Uses inline runtime code to avoid external file dependencies.
 */

import { createServer, type Server, type Socket } from "node:net";
import type { Tool } from "ai";
import {
  createErrorResponse,
  createResponse,
  parseMessage,
  serializeMessage,
} from "./json-rpc.ts";
import {
  type CallHandlerParams,
  JsonRpcErrorCode,
  type JsonRpcRequest,
  type JsonRpcResponse,
  ProxyMethod,
  type ToolDefinition,
  type ToolResult,
} from "./types.ts";

/**
 * ACP EnvVariable format
 */
export interface EnvVariable {
  name: string;
  value: string;
}

/**
 * MCP server configuration for session.mcpServers (ACP Stdio format)
 */
export interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env: EnvVariable[];
}

import { RUNTIME_CODE } from "./tool-proxy-runtime.ts";

/**
 * Tool Proxy Host manages a TCP server that receives tool execution requests
 * from the runtime process (spawned by ACP agent).
 */
export class ToolProxyHost {
  private server: Server | null = null;
  private connections: Socket[] = [];
  private tools = new Map<string, Tool<any, any>>();
  private serverName: string;
  private port: number = 0;

  constructor(name = "acp-tool-proxy") {
    this.serverName = name;
  }

  /**
   * Register an AI SDK tool to be exposed through the proxy
   */
  registerTool(name: string, tool: Tool<any, any>): void {
    this.tools.set(name, tool);
  }

  /**
   * Register multiple tools at once
   */
  registerTools(tools: Record<string, Tool<any, any>>): void {
    for (const [name, tool] of Object.entries(tools)) {
      this.registerTool(name, tool);
    }
  }

  /**
   * Get tool definitions for the runtime
   */
  private getToolDefinitions(): ToolDefinition[] {
    const definitions: ToolDefinition[] = [];
    for (const [name, tool] of this.tools.entries()) {
      definitions.push({
        name,
        description: tool.description || `Tool: ${name}`,
        // inputSchema from Tool can be Zod or JSON schema, cast to JSON schema format
        inputSchema: (tool.inputSchema as Record<string, unknown>) ||
          { type: "object", properties: {} },
      });
    }
    return definitions;
  }

  /**
   * Start TCP server and return MCP server config for ACP
   */
  async start(): Promise<MCPServerConfig> {
    if (!this.server) {
      // Create TCP server for runtime callbacks if not started
      await this.startServer();
    }

    return this.getServerConfig();
  }

  /**
   * Get MCP server configuration
   */
  private getServerConfig(): MCPServerConfig {
    // Uses node -e with inline runtime code
    // NO TOOLS passed in env - runtime will fetch them via TCP
    return {
      name: this.serverName,
      command: "node",
      args: ["-e", RUNTIME_CODE],
      env: [
        { name: "ACP_TOOL_PROXY_PORT", value: String(this.port) },
      ],
    };
  }

  /**
   * Start TCP server to receive tool execution requests
   */
  private startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => {
        this.handleConnection(socket);
      });

      this.server.on("error", (err) => {
        // console.error("[ToolProxy] Server error:", err);
        reject(err);
      });

      // Listen on random available port
      this.server.listen(0, "127.0.0.1", () => {
        const address = this.server!.address();
        if (typeof address === "object" && address) {
          this.port = address.port;
          // console.log(`[ToolProxy] Listening on port ${this.port}`);
          resolve();
        } else {
          reject(new Error("Failed to get server address"));
        }
      });
    });
  }

  /**
   * Handle incoming connection from runtime
   */
  private handleConnection(socket: Socket): void {
    this.connections.push(socket);

    let buffer = "";

    socket.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;

        const message = parseMessage(line);
        if (!message) continue;

        if ("method" in message) {
          this.handleRequest(socket, message as JsonRpcRequest).catch((err) =>
            console.error("[ToolProxy] Error handling request:", err)
          );
        }
      }
    });

    socket.on("close", () => {
      this.connections = this.connections.filter((c) => c !== socket);
    });

    socket.on("error", (err) => {
      console.error("[ToolProxy] Socket error:", err);
    });
  }

  /**
   * Handle JSON-RPC request from runtime
   */
  private async handleRequest(
    socket: Socket,
    request: JsonRpcRequest,
  ): Promise<void> {
    try {
      if (request.method === ProxyMethod.CALL_HANDLER) {
        const params = request.params as CallHandlerParams;
        const tool = this.tools.get(params.name);

        if (!tool) {
          this.sendResponse(
            socket,
            createErrorResponse(
              request.id,
              JsonRpcErrorCode.METHOD_NOT_FOUND,
              `Tool not found: ${params.name}`,
            ),
          );
          return;
        }

        if (!tool.execute) {
          this.sendResponse(
            socket,
            createErrorResponse(
              request.id,
              JsonRpcErrorCode.INTERNAL_ERROR,
              `Tool has no execute function: ${params.name}`,
            ),
          );
          return;
        }

        // Execute the tool on host side (Tool.execute expects args and options)
        const result = await tool.execute?.(params.args, {
          toolCallId: params.name,
          messages: [],
        });

        // Format as MCP tool result
        const toolResult: ToolResult = {
          content: [
            {
              type: "text",
              text: typeof result === "string"
                ? result
                : JSON.stringify(result),
            },
          ],
        };

        this.sendResponse(socket, createResponse(request.id, toolResult));
      } else if (request.method === "getTools") {
        // New handler for fetching tools via TCP
        const definitions = this.getToolDefinitions();
        this.sendResponse(
          socket,
          createResponse(request.id, definitions),
        );
      } else {
        this.sendResponse(
          socket,
          createErrorResponse(
            request.id,
            JsonRpcErrorCode.METHOD_NOT_FOUND,
            `Unknown method: ${request.method}`,
          ),
        );
      }
    } catch (error) {
      this.sendResponse(
        socket,
        createErrorResponse(
          request.id,
          JsonRpcErrorCode.INTERNAL_ERROR,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  /**
   * Send response to runtime
   */
  private sendResponse(socket: Socket, response: JsonRpcResponse): void {
    socket.write(serializeMessage(response) + "\n");
  }

  /**
   * Stop the TCP server
   */
  stop(): void {
    for (const socket of this.connections) {
      socket.destroy();
    }
    this.connections = [];

    if (this.server) {
      this.server.close();
      this.server = null;
    }

    this.port = 0;
  }
}
