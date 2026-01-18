import type { JSONSchema } from "../types.ts";

export interface SimpleArgsDefCreator {
  forSampling: () => JSONSchema;
  forAgentic: (allToolNames: string[]) => JSONSchema;
}

export function createArgsDefFactory(
  _name: string,
  _allToolNames: string[],
  _depGroups: Record<string, unknown>,
  _predefinedSteps?: unknown,
  _ensureStepActions?: string[],
): SimpleArgsDefCreator {
  return {
    forSampling: function (): JSONSchema {
      return {
        type: "object",
        description: "Provide user request for autonomous tool execution",
        properties: {
          userRequest: {
            type: "string",
            description:
              "The task or request that should be completed autonomously by the agentic system using available tools",
          },
          context: {
            type: "object",
            description:
              "Necessary context for the request, e.g., the absolute path of the current working directory. This is just an example; any relevant context fields are allowed.",
            additionalProperties: true,
          },
        },
        required: ["userRequest", "context"],
        errorMessage: {
          required: {
            userRequest:
              "Missing required field 'userRequest'. Please provide a clear task description.",
            context:
              "Missing required field 'context'. Please provide relevant context (e.g., current working directory).",
          },
        },
      };
    },

    /**
     * Agentic schema - simplified Unix-style interface
     *
     * Only two fields:
     * - `tool`: which tool to execute (enum includes "man" + all tool names)
     * - `args`: parameters for the tool (array for "man", object for others)
     */
    forAgentic: function (allToolNames: string[]): JSONSchema {
      // "man" is a built-in command for getting tool schemas
      const toolEnum = ["man", ...allToolNames];

      return {
        type: "object",
        properties: {
          tool: {
            type: "string",
            enum: toolEnum,
            description:
              'Which tool to execute. Use "man" to get tool schemas, or a tool name to execute.',
            errorMessage: {
              enum: `Invalid tool. Available: ${toolEnum.join(", ")}`,
            },
          },
          args: {
            description:
              'For "man": array of tool names ["tool1", "tool2"]. For other tools: object with parameters.',
          },
        },
        required: ["tool"],
        additionalProperties: false,
      };
    },
  };
}
