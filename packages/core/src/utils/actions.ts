import { jsonSchema, Tool } from "ai";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const toolNameToSchema = (actions: Record<string, Tool>) => {
  return Object.fromEntries(
    Object.entries(actions).map(([key, tool]) => [
      key,
      tool.parameters.jsonSchema,
    ])
  );
};

export const internalActions: Record<string, Tool> = {
  reasoning: {
    parameters: jsonSchema({
      type: "object",
      properties: {
        result: {
          type: "string",
          description:
            "The reasoning process, analysis, or logical thinking steps used to approach the problem",
        },
      },
      required: ["result"],
    }),
    description:
      "Use this tool to think through problems step by step, analyze information, and apply logical reasoning before providing answers",
    execute: async ({ result }) => {
      return {
        content: [{ type: "text", text: "Success" }],
      } as CallToolResult;
    },
  },
  planning: {
    parameters: jsonSchema({
      type: "object",
      properties: {
        result: {
          type: "string",
          description:
            "The planning process, including breaking down tasks, considering steps, timelines, and organizing approach",
        },
      },
      required: ["result"],
    }),
    description:
      "Use this tool to plan and organize your approach before executing tasks, including breaking down complex requests into manageable steps",
    execute: async ({ result }) => {
      return {
        content: [{ type: "text", text: "Success" }],
      } as CallToolResult;
    },
  },
};
