/**
 * Dynamic Tool Change Executor
 *
 * Implements dynamic tool parameter changes by:
 * 1. Allowing tools to be modified at runtime
 * 2. Notifying clients when tool definitions change
 * 3. Maintaining state of which tools are currently available
 *
 * This is inspired by GitHub MCP Server's dynamic toolsets feature.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ComposableMCPServer } from "../../compose.ts";

export class DynamicToolChangeExecutor {
  private enabledTools: Set<string>;

  constructor(
    private readonly toolName: string,
    private readonly availableToolNames: string[],
    private readonly toolNameToDetails: Array<[string, any]>,
    private readonly server: ComposableMCPServer,
  ) {
    // Start with all tools enabled by default
    this.enabledTools = new Set(availableToolNames);
  }

  /**
   * Get list of currently enabled tools
   */
  getEnabledTools(): string[] {
    return Array.from(this.enabledTools);
  }

  /**
   * Enable specific tools and notify clients
   */
  async enableTools(toolNames: string[]): Promise<void> {
    const newlyEnabled: string[] = [];

    for (const toolName of toolNames) {
      if (
        this.availableToolNames.includes(toolName) &&
        !this.enabledTools.has(toolName)
      ) {
        this.enabledTools.add(toolName);
        newlyEnabled.push(toolName);
      }
    }

    if (newlyEnabled.length > 0) {
      // Notify clients that tool list has changed
      await this.server.sendToolListChanged();
    }
  }

  async execute(
    args: Record<string, unknown>,
    _schema: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const { action, parameters, enable_tools } = args;

    // Handle tool enabling
    if (enable_tools && Array.isArray(enable_tools)) {
      await this.enableTools(enable_tools.map(String));
      return {
        content: [
          {
            type: "text",
            text: `Enabled tools: ${
              enable_tools.join(
                ", ",
              )
            }\nCurrently enabled: ${this.getEnabledTools().join(", ")}`,
          },
        ],
      };
    }

    // Regular tool execution
    if (!action) {
      return {
        content: [
          {
            type: "text",
            text: `Available actions:\n${
              this.getEnabledTools()
                .map((name) => `- ${name}`)
                .join(
                  "\n",
                )
            }\n\nSelect an action or use 'enable_tools' / 'disable_tools' to manage available tools.`,
          },
        ],
      };
    }

    const actionStr = String(action);

    // Check if tool is enabled
    if (!this.enabledTools.has(actionStr)) {
      return {
        content: [
          {
            type: "text",
            text:
              `Tool "${actionStr}" is not currently enabled. Use 'enable_tools' to enable it first.\nCurrently enabled: ${
                this.getEnabledTools().join(
                  ", ",
                )
              }`,
          },
        ],
        isError: true,
      };
    }

    // Execute the tool
    try {
      const result = await this.server.callTool(actionStr, parameters || {});
      return result as CallToolResult;
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error executing ${actionStr}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
        isError: true,
      };
    }
  }
}
