/**
 * Sandbox Executor using Deno
 *
 * This executor spawns a Deno subprocess and communicates with it via JSON-RPC
 * over stdin/stdout to execute user code securely.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { type ChildProcess, spawn } from "node:child_process";
import type { Buffer } from "node:buffer";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { JsonRpcHandler } from "./json-rpc.ts";
import {
  type CallToolRequest,
  JsonRpcErrorCode,
  JsonRpcMethod,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "./types.ts";

export interface SandboxConfig {
  timeout?: number; // Execution timeout in milliseconds
  memoryLimit?: number; // Memory limit in MB
  permissions?: string[]; // Deno permission flags, e.g., ["--allow-net", "--allow-read"]
}

export interface ToolCallHandler {
  (toolName: string, params: unknown): Promise<CallToolResult>;
}

export class SandboxExecutor {
  private process: ChildProcess | null = null;
  private jsonRpc = new JsonRpcHandler();
  private pendingRequests = new Map<
    string | number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private buffer = "";

  constructor(
    private config: SandboxConfig = {},
    private toolCallHandler?: ToolCallHandler,
  ) {}

  /**
   * Get Deno binary path from npm package
   */
  private getDenoBinaryPath(): string {
    const resolver = (
      import.meta as { resolve?: (specifier: string) => string }
    ).resolve;
    if (!resolver) throw new Error("Cannot resolve deno package");

    const pkgUrl = resolver("deno/package.json");
    const denoDir = path.dirname(fileURLToPath(pkgUrl));
    return path.join(denoDir, "bin.cjs");
  }

  /**
   * Start Deno sandbox process
   */
  start(): void {
    if (this.process) throw new Error("Sandbox already started");

    const runtimePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../sandbox/runtime.ts",
    );

    const args = ["run", "--no-prompt"];

    if (this.config.memoryLimit) {
      args.push(`--v8-flags=--max-old-space-size=${this.config.memoryLimit}`);
    }

    if (this.config.permissions) {
      args.push(...this.config.permissions);
    }

    args.push(runtimePath);

    this.process = spawn(this.getDenoBinaryPath(), args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.stdout?.on("data", (data: Buffer) => this.handleStdout(data));
    this.process.stderr?.on(
      "data",
      (data: Buffer) => console.error("Sandbox stderr:", data.toString()),
    );
    this.process.on("error", (error: Error) => {
      console.error("Sandbox error:", error);
      this.cleanup();
    });
    this.process.on("exit", (code: number | null) => {
      console.log("Sandbox exited:", code);
      this.cleanup();
    });
  }

  /**
   * Handle stdout data from sandbox
   */
  private handleStdout(data: Buffer): void {
    this.buffer += data.toString();
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;

      const message = this.jsonRpc.parseMessage(line);
      if (!message) {
        console.error("Failed to parse message:", line);
        continue;
      }

      // Dispatch to response or request handler
      if ("result" in message || "error" in message) {
        this.handleResponse(message as JsonRpcResponse);
      } else if ("method" in message) {
        this.handleRequest(message as JsonRpcRequest).catch((err) =>
          console.error("Error handling request:", err)
        );
      }
    }
  }

  /**
   * Handle JSON-RPC response from sandbox
   */
  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      console.error("Unknown request ID:", response.id);
      return;
    }

    this.pendingRequests.delete(response.id);
    response.error
      ? pending.reject(new Error(response.error.message))
      : pending.resolve(response.result);
  }

  /**
   * Handle JSON-RPC request from sandbox (tool calls)
   */
  private async handleRequest(request: JsonRpcRequest): Promise<void> {
    try {
      if (request.method === JsonRpcMethod.CALL_TOOL) {
        if (!this.toolCallHandler) throw new Error("No tool call handler");

        const params = request.params as CallToolRequest;
        const result = await this.toolCallHandler(
          params.toolName,
          params.params,
        );
        this.sendMessage(this.jsonRpc.createResponse(request.id, result));
      } else {
        this.sendMessage(
          this.jsonRpc.createErrorResponse(
            request.id,
            JsonRpcErrorCode.METHOD_NOT_FOUND,
            `Method not found: ${request.method}`,
          ),
        );
      }
    } catch (error) {
      this.sendMessage(
        this.jsonRpc.createErrorResponse(
          request.id,
          JsonRpcErrorCode.INTERNAL_ERROR,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  /**
   * Send message to sandbox
   */
  private sendMessage(message: JsonRpcRequest | JsonRpcResponse): void {
    if (!this.process?.stdin) throw new Error("Sandbox not started");
    this.process.stdin.write(this.jsonRpc.serializeMessage(message) + "\n");
  }

  /**
   * Send request and wait for response
   */
  private sendRequest(
    method: string,
    params?: unknown,
    timeout?: number,
  ): Promise<unknown> {
    if (!this.process) throw new Error("Sandbox not started");

    const request = this.jsonRpc.createRequest(method, params);
    const timeoutMs = timeout || this.config.timeout || 30000;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(request.id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });

      this.sendMessage(request);
    });
  }

  /**
   * Execute code in sandbox
   */
  async executeCode(
    code: string,
    hasDefinitions: string[],
  ): Promise<CallToolResult> {
    try {
      const result = (await this.sendRequest(JsonRpcMethod.EXECUTE_CODE, {
        code,
        hasDefinitions,
      })) as {
        logs: string[];
        result?: CallToolResult;
        error?: string;
      };

      if (result.error) {
        return {
          content: [{ type: "text", text: `Execution error: ${result.error}` }],
          isError: true,
        };
      }

      const content: { type: "text"; text: string }[] = [];

      // Add console logs if any
      if (result.logs.length > 0) {
        content.push({
          type: "text",
          text: result.logs.join("\n"),
        });
      }

      // If nothing was produced, add a success message
      if (content.length === 0) {
        content.push({
          type: "text",
          text:
            "Code executed successfully (no output), use console.log() to log output",
        });
      }

      return { content };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Stop sandbox process
   */
  stop(): void {
    if (!this.process) return;

    try {
      this.process.stdin?.end();
    } catch {
      /* ignore */
    }
    try {
      this.process.kill("SIGTERM");
    } catch {
      /* ignore */
    }

    this.cleanup();
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.process) {
      this.process.stdout?.removeAllListeners();
      this.process.stderr?.removeAllListeners();
      this.process.removeAllListeners();
      this.process.stdout?.destroy();
      this.process.stderr?.destroy();
      this.process.stdin?.destroy();
    }

    this.process = null;

    for (const pending of this.pendingRequests.values()) {
      pending.reject(new Error("Sandbox terminated"));
    }
    this.pendingRequests.clear();
  }
}
