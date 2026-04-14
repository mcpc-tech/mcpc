/**
 * Sandbox Executor using @mcpc-tech/handle-sandbox
 *
 * Wrapper around the handle-sandbox package for executing user code securely.
 */

import { Sandbox, type SandboxConfig } from "@mcpc-tech/handle-sandbox";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface ToolCallHandler {
  (toolName: string, params: unknown): Promise<CallToolResult>;
}

export interface SandboxHandler {
  (...args: unknown[]): Promise<unknown>;
}

export type { SandboxConfig };

export class SandboxExecutor {
  private sandbox: Sandbox;
  private toolCallHandler?: ToolCallHandler;
  private extraHandlers = new Map<string, SandboxHandler>();
  private started = false;

  constructor(config: SandboxConfig = {}, toolCallHandler?: ToolCallHandler) {
    this.sandbox = new Sandbox(config);
    this.toolCallHandler = toolCallHandler;
  }

  /**
   * Register an additional host handler for sandboxed code.
   */
  registerHandler(name: string, handler: SandboxHandler): void {
    this.extraHandlers.set(name, handler);
    if (this.started) {
      this.sandbox.registerHandler(name, handler);
    }
  }

  /**
   * Start Deno sandbox process
   */
  start(): void {
    // Register the tool call handler
    if (this.toolCallHandler) {
      this.sandbox.registerHandler(
        "tool",
        async (...args: unknown[]) => {
          const [toolName, params] = args as [string, unknown];
          return await this.toolCallHandler!(toolName, params);
        },
      );
    }

    for (const [name, handler] of this.extraHandlers) {
      this.sandbox.registerHandler(name, handler);
    }

    this.sandbox.start();
    this.started = true;
  }

  /**
   * Execute code in sandbox
   */
  async executeCode(code: string): Promise<CallToolResult> {
    try {
      const result = await this.sandbox.execute(code);

      if (result.error) {
        return {
          content: [{ type: "text", text: `Execution error: ${result.error}` }],
          isError: true,
        };
      }

      const content: { type: "text"; text: string }[] = [];

      // Add console logs if any
      if (result.logs && result.logs.length > 0) {
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
    this.started = false;
    this.sandbox.stop();
  }
}
