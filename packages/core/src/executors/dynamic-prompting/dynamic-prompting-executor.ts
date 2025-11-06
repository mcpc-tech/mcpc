/**
 * Dynamic Prompting Executor
 *
 * Implements a two-stage execution model:
 * 1. User selects an action/tool they want to execute
 * 2. Agent prompts user for specific parameters needed for that tool
 *
 * This helps reduce tool confusion by splitting tool selection from parameter gathering.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ComposableMCPServer } from "../../compose.ts";

export class DynamicPromptingExecutor {
  constructor(
    private readonly toolName: string,
    private readonly availableToolNames: string[],
    private readonly toolNameToDetails: Array<[string, any]>,
    private readonly server: ComposableMCPServer,
  ) {}

  async execute(
    args: Record<string, unknown>,
    _schema: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const { action, parameters } = args;

    // Stage 1: Action selection
    if (!action) {
      return {
        content: [{
          type: "text",
          text: `Please select an action from the available tools:\n${
            this.availableToolNames.map((name) => `- ${name}`).join("\n")
          }\n\nProvide the action name in the 'action' parameter.`,
        }],
      };
    }

    // Stage 2: Parameter gathering
    const actionStr = String(action);

    // Check if tool exists
    const toolDetail = this.toolNameToDetails.find(([name]) =>
      name === actionStr
    );
    if (!toolDetail) {
      return {
        content: [{
          type: "text",
          text: `Action "${actionStr}" not found. Available actions:\n${
            this.availableToolNames.map((name) => `- ${name}`).join("\n")
          }`,
        }],
        isError: true,
      };
    }

    // If parameters are not provided, prompt for them
    if (!parameters || typeof parameters !== "object") {
      const [toolName, toolDetails] = toolDetail;
      const inputSchema = toolDetails.inputSchema || {};
      const properties = inputSchema.properties || {};
      const required = inputSchema.required || [];

      const paramDescriptions = Object.entries(properties).map(
        ([propName, propDef]: [string, any]) => {
          const requiredMarker = required.includes(propName)
            ? " (required)"
            : " (optional)";
          const description = propDef.description || "No description";
          return `- ${propName}${requiredMarker}: ${description}`;
        },
      ).join("\n");

      return {
        content: [{
          type: "text",
          text:
            `You selected action: ${toolName}\n\nPlease provide the following parameters:\n${paramDescriptions}\n\nProvide them in the 'parameters' field as a JSON object.`,
        }],
      };
    }

    // Stage 3: Execute the tool with parameters
    try {
      const result = await this.server.callTool(actionStr, parameters);
      return result as CallToolResult;
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error executing ${actionStr}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        }],
        isError: true,
      };
    }
  }
}
