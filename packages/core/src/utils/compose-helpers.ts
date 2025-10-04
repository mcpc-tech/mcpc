/**
 * Helper functions for the compose method
 * Breaks down the large compose method into focused, testable units
 */

import type { ComposableMCPServer } from "../compose.ts";
import type { ComposedTool } from "../plugin-types.ts";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { JSONSchema } from "../types.ts";
import { updateRefPaths } from "./common/schema.ts";

/**
 * Process tools with plugin transformations
 */
export async function processToolsWithPlugins(
  server: ComposableMCPServer,
  externalTools: Record<string, ComposedTool>,
  mode: "agentic" | "agentic_workflow",
): Promise<void> {
  const toolManager = (server as any).toolManager;
  const pluginManager = (server as any).pluginManager;

  for (const [toolId, toolData] of toolManager.getToolEntries()) {
    const defaultSchema = {
      type: "object",
      properties: {},
      additionalProperties: true,
    } as Tool["inputSchema"];

    const tempTool: ComposedTool = {
      name: toolId,
      description: toolData.description,
      inputSchema: (toolData.schema as Tool["inputSchema"]) || defaultSchema,
      execute: toolData.callback,
    };

    const processedTool = await pluginManager.applyTransformToolHooks(
      tempTool,
      {
        toolName: toolId,
        server,
        mode,
        originalTool: { ...tempTool },
        transformationIndex: 0,
      },
    );

    toolManager.registerTool(
      toolId,
      processedTool.description || toolData.description,
      processedTool.inputSchema as JSONSchema,
      processedTool.execute,
    );

    if (externalTools[toolId]) {
      // If a visibility processor is provided by built-in plugins, try to call it.
      try {
        const builtIn: any = await import("../plugins/built-in/index.ts");
        if (builtIn && typeof builtIn.processToolVisibility === "function") {
          builtIn.processToolVisibility(
            toolId,
            processedTool,
            server,
            externalTools,
          );
        }
      } catch {
        // ignore if not present
      }

      externalTools[toolId] = processedTool;
    }
  }
}

/**
 * Build dependency groups for tool schema
 */
export function buildDependencyGroups(
  toolNameToDetailList: [string, ComposedTool][],
  hiddenToolNames: string[],
  publicToolNames: string[],
  server: ComposableMCPServer,
): Record<string, unknown> {
  const depGroups: Record<string, unknown> = {};
  const toolManager = (server as any).toolManager;

  toolNameToDetailList.forEach(([toolName, tool]) => {
    const resolvedName = toolManager.resolveToolName(toolName);
    if (
      hiddenToolNames.includes(resolvedName ?? "") ||
      publicToolNames.includes(resolvedName ?? "")
    ) {
      return;
    }

    if (!tool) {
      const allToolNames = [
        ...toolNameToDetailList.map(([n]) => n),
      ];
      throw new Error(
        `Action ${toolName} not found, available action list: ${
          allToolNames.join(", ")
        }`,
      );
    }

    const baseSchema = (tool.inputSchema.jsonSchema as JSONSchema) ??
      tool.inputSchema ?? {
      type: "object",
      properties: {},
      required: [],
    };

    const baseProperties = baseSchema.type === "object" && baseSchema.properties
      ? baseSchema.properties
      : {};
    const baseRequired =
      baseSchema.type === "object" && Array.isArray(baseSchema.required)
        ? baseSchema.required
        : [];

    const updatedProperties = updateRefPaths(baseProperties, toolName);

    depGroups[toolName] = {
      type: "object",
      description: tool.description,
      properties: updatedProperties,
      required: [...baseRequired],
      additionalProperties: false,
    };
  });

  return depGroups;
}

/**
 * Register global tools on the server
 */
export function registerGlobalTools(
  globalToolNames: string[],
  tools: Record<string, ComposedTool>,
  server: ComposableMCPServer,
): void {
  const { jsonSchema } = require("ai");

  globalToolNames.forEach((toolId) => {
    const tool = tools[toolId];
    if (!tool) {
      throw new Error(
        `Global tool ${toolId} not found in registry, available: ${
          Object.keys(tools).join(", ")
        }`,
      );
    }
    server.tool(
      toolId,
      tool.description || "No description available",
      jsonSchema(tool.inputSchema as any),
      tool.execute,
    );
  });
}
