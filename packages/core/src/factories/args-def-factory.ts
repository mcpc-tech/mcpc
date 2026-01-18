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
        description: "Provide prompt for autonomous tool execution",
        properties: {
          prompt: {
            type: "string",
            description:
              "The task to be completed autonomously by the agentic system using available tools",
          },
          context: {
            type: "object",
            description:
              "Execution context, e.g., { cwd: '/path/to/dir' }. Any relevant fields allowed.",
            additionalProperties: true,
          },
        },
        required: ["prompt", "context"],
        errorMessage: {
          required: {
            prompt:
              "Missing required field 'prompt'. Please provide a clear task description.",
            context:
              "Missing required field 'context'. Please provide relevant context (e.g., { cwd: '...' }).",
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
