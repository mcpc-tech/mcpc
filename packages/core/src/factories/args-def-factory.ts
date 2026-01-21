import type { JSONSchema } from "../types.ts";

export interface SimpleArgsDefCreator {
  forSampling: () => JSONSchema;
  forAgentic: (allToolNames: string[]) => JSONSchema;
  forMan: (allToolNames: string[]) => JSONSchema;
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
     * - `args`: object with parameters. For "man": { tools: ["a", "b"] }. For others: tool parameters.
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
            type: "object",
            description:
              'For "man": { tools: ["tool1", "tool2"], manual?: true }. For other tools: tool parameters that strictly adhere to the tool\'s JSON schema.',
          },
        },
        required: ["tool"],
        additionalProperties: false,
      };
    },

    /**
     * Schema for "man" command args validation
     * Expected format: { tools: ["tool1", "tool2"], manual?: true }
     *
     * - Always require `tools`
     * - Allow empty tools only when `manual: true`
     */
    forMan: function (allToolNames: string[]): JSONSchema {
      return {
        type: "object",
        properties: {
          tools: {
            type: "array",
            items: {
              type: "string",
              enum: allToolNames,
              errorMessage: {
                enum: `Invalid tool name. Available: ${
                  allToolNames.join(", ")
                }`,
              },
            },
          },
          manual: {
            type: "boolean",
            description:
              "Set to true to get the full manual for this agent (progressive disclosure).",
          },
        },
        required: ["tools"],
        additionalProperties: false,
        anyOf: [
          // manual-only (tools can be empty)
          {
            properties: {
              manual: { enum: [true] },
              tools: { minItems: 0 },
            },
            required: ["tools", "manual"],
          },
          // tool schemas (require at least one tool)
          {
            properties: {
              tools: {
                minItems: 1,
                errorMessage: {
                  minItems: "At least one tool name is required",
                },
              },
            },
            required: ["tools"],
          },
        ],
        errorMessage: {
          required: {
            tools:
              'Missing "tools" field. Expected: { tools: ["tool1", "tool2"] }',
          },
        },
      };
    },
  };
}
