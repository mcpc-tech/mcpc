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
        context: {
          type: "string",
          description:
            "First, clearly identify what the problem is asking and what information you have available",
        },
        analysis: {
          type: "string",
          description:
            "Break down the problem step by step. Show your logical reasoning process, calculations, or decision-making steps",
        },
        conclusion: {
          type: "string",
          description:
            "State your final answer clearly and explain why this conclusion follows from your analysis",
        },
      },
      required: ["context", "analysis", "conclusion"],
    }),
    description: `Use this tool to think through complex problems systematically. You MUST:
    1. First understand the context and what's being asked
    2. Show detailed step-by-step analysis 
    3. Reach a clear conclusion based on your reasoning`,
    execute: async ({ context, analysis, conclusion }) => {
      return {
        content: [{ type: "text", text: "Reasoning process documented" }],
      } as CallToolResult;
    },
  },
};
