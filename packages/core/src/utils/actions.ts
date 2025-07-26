import { jsonSchema, Tool } from "ai";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const toolNameToSchema = (actions: Record<string, Tool>) => {
  return Object.fromEntries(
    Object.entries(actions).map(([key, tool]) => [
      key,
      tool.parameters.jsonSchema,
    ]),
  );
};

export const internalActions: Record<string, Tool> = {
  reasoning: {
    parameters: jsonSchema({
      type: "object",
      properties: {
        context: {
          type: "string",
          description: "Problem definition and available information",
        },
        analysis: {
          type: "string",
          description: "Step-by-step logical reasoning and calculations",
        },
        conclusion: {
          type: "string",
          description: "Final answer with clear justification",
        },
      },
      required: ["context", "analysis", "conclusion"],
    }),
    description: `Systematic problem-solving tool. Steps:
    1. Context: Define the problem and available information
    2. Analysis: Break down step-by-step reasoning
    3. Conclusion: State clear answer with justification`,
    execute: async ({ context, analysis, conclusion }) => {
      return {
        content: [{ type: "text", text: "Reasoning process documented" }],
      } as CallToolResult;
    },
  },
};
