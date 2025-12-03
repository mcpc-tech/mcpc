import { pick } from "@es-toolkit/es-toolkit";
import type { MCPCStep, WorkflowState } from "../utils/state.ts";
import type { ArgsDefCreator, JSONSchema } from "../types.ts";
import { CompiledPrompts } from "../prompts/index.ts";

// Decision options for workflow step execution control
export const DECISION_OPTIONS = {
  RETRY: "retry",
  PROCEED: "proceed",
  COMPLETE: "complete",
} as const;

export type DecisionOption =
  (typeof DECISION_OPTIONS)[keyof typeof DECISION_OPTIONS];

export function createArgsDefFactory(
  name: string,
  allToolNames: string[],
  depGroups: Record<string, unknown>,
  predefinedSteps?: MCPCStep[],
  ensureStepActions?: string[],
): ArgsDefCreator {
  // Helper function to format ensureStepActions for display
  const formatEnsureStepActions = (): string => {
    if (!ensureStepActions || ensureStepActions.length === 0) {
      return "";
    }
    return `\n\n## Required Actions
The workflow MUST include at least one of these actions:
${ensureStepActions.map((action) => `- \`${action}\``).join("\n")}`;
  };

  return {
    common: (
      extra: { [n: string]: JSONSchema },
      optionalFields: string[] = [],
    ): JSONSchema => {
      const requiredFields = Object.keys(extra).filter(
        (key) => !optionalFields.includes(key),
      );
      return {
        type: "object",
        description: `**Tool parameters dynamically update per workflow step**`,
        properties: {
          ...extra,
        },
        required: requiredFields,
      };
    },

    steps: (): JSONSchema => ({
      type: "array",
      description: `
Workflow step definitions - provide ONLY on initial call.

**CRITICAL RULES:**
- **Sequential Dependency:** If Action B depends on Action A's result → separate steps
- **Concurrent Actions:** Independent actions can share one step  
- **Complete Mapping:** Include ALL requested operations
- **Predefined Steps:** Leave unspecified if predefined steps exist

**BEST PRACTICES:**
- Atomic, focused steps
- Idempotent actions for safe retries
- Clear step descriptions with input/output context`,
      items: {
        type: "object",
        description:
          `A single step containing actions that execute concurrently. All actions in this step run simultaneously with no guaranteed order.`,
        properties: {
          description: {
            type: "string",
            description:
              `**Step purpose, required inputs, and expected outputs**`,
          },
          actions: {
            type: "array",
            description:
              `Array of action names for this step. **CURRENT LIMITATION: Only 1 action per step is allowed.** Action names must match available tool names exactly.`,
            items: {
              ...{
                enum: allToolNames,
              },
              type: "string",
              description:
                `Individual action name from available tools. Must be exactly one of the allowed tool names.`,
            },
            uniqueItems: true,
            minItems: 0,
            // TODO: remove this restriction when workflow planning is good enough
            maxItems: 1,
          },
        },
        required: ["description", "actions"],
        additionalProperties: false,
      },
      default: predefinedSteps ? predefinedSteps : undefined,
      minItems: 1,
    }),

    init: (): JSONSchema => ({
      type: "boolean",
      description: `Init a new workflow`,
      enum: [true],
    }),

    decision: (): JSONSchema => ({
      type: "string",
      enum: Object.values(DECISION_OPTIONS),
      description:
        `**Step control: \`${DECISION_OPTIONS.PROCEED}\` = next step, \`${DECISION_OPTIONS.RETRY}\` = retry/repeat current, \`${DECISION_OPTIONS.COMPLETE}\` = finish workflow**`,
      errorMessage: {
        enum: `Invalid decision. Must be one of: ${
          Object.values(DECISION_OPTIONS).join(", ")
        }.`,
      },
    }),

    action: (): JSONSchema => ({
      type: "string",
      description: "Define the current workflow action to be performed",
      enum: allToolNames,
      required: ["action"],
      errorMessage: {
        enum: `Invalid action. Must be one of: ${allToolNames.join(", ")}.`,
      },
    }),

    forTool: function (): JSONSchema {
      return this.common({});
    },

    forCurrentState: function (state: WorkflowState): JSONSchema {
      const currentStep = state.getCurrentStep();
      if (!state.isWorkflowInitialized() || !currentStep) {
        state.reset();
        const initSchema: Record<string, JSONSchema> = { init: this.init() };
        if (!predefinedSteps) {
          initSchema.steps = this.steps();
        }
        return this.common(initSchema);
      }

      const stepDependencies = {
        ...pick(depGroups, currentStep.actions),
      } as Record<string, JSONSchema>;

      stepDependencies["decision"] = this.decision();
      stepDependencies["action"] = this.action();

      // Make decision required when workflow is in progress and needs user decision
      return this.common(stepDependencies);
    },

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

    forAgentic: function (
      toolNameToDetailList: [string, unknown][],
      _sampling: boolean = false,
      USE_TOOL_KEY: string = "useTool",
    ): JSONSchema {
      const allOf = [
        // When a specific tool is selected, its parameters must be provided
        ...toolNameToDetailList.map(
          ([toolName, _toolDetail]: [string, unknown]) => {
            return {
              if: {
                properties: { [USE_TOOL_KEY]: { const: toolName } },
                required: [USE_TOOL_KEY],
              },
              then: {
                required: [toolName],
                errorMessage: {
                  required: {
                    [toolName]:
                      `Tool "${toolName}" is selected but its parameters are missing. Please provide "${toolName}": { ...parameters }.`,
                  },
                },
              },
            };
          },
        ),
      ];

      const useToolDescription =
        `Specifies which tool to execute from the available options. **When setting \`useTool: "example_tool"\`, you MUST also provide \`"example_tool": { ...parameters }\` with that tool's parameters**`;

      const toolItems = allToolNames.length > 0
        ? { type: "string", enum: allToolNames }
        : { type: "string" };

      const baseProperties = {
        [USE_TOOL_KEY]: {
          type: "string",
          enum: allToolNames,
          description: useToolDescription,
          errorMessage: {
            enum: `Invalid tool name. Available tools: ${
              allToolNames.join(", ")
            }.`,
          },
        },
        hasDefinitions: {
          type: "array",
          items: toolItems,
          description:
            "Tool names whose schemas you already have. List all tools you have schemas for to avoid duplicate schema requests and reduce token usage.",
        },
        definitionsOf: {
          type: "array",
          items: toolItems,
          description:
            "Tool names whose schemas you need. Request tool schemas before calling them to understand their parameters.",
        },
        // ...depGroups,
      };

      const requiredFields: Array<string> = [];

      const schema: JSONSchema = {
        additionalProperties: true,
        type: "object",
        properties: baseProperties,
        required: requiredFields,
      };

      // Only add allOf if there are items to avoid schema validation error
      if (allOf.length > 0) {
        schema.allOf = allOf;
      }

      // Add conditional validation: if definitionsOf is empty/missing, useTool is required
      if (allToolNames.length > 0) {
        const thenClause = {
          required: [USE_TOOL_KEY],
          errorMessage: {
            required: {
              [USE_TOOL_KEY]:
                `No tool selected. Please specify "${USE_TOOL_KEY}" to select one of: ${
                  allToolNames.join(", ")
                }. Or use "definitionsOf" with tool names to get their schemas first.`,
            },
          },
        };
        Object.assign(schema, {
          if: {
            // definitionsOf is not provided OR is empty array
            anyOf: [
              { not: { required: ["definitionsOf"] } },
              { properties: { definitionsOf: { type: "array", maxItems: 0 } } },
            ],
          },
          then: thenClause,
        });
      }

      return schema;
    },

    forNextState: function (state: WorkflowState): JSONSchema {
      if (!state.isWorkflowInitialized() || !state.hasNextStep()) {
        throw new Error(`Cannot get next state schema: no next step available`);
      }

      const currentStepIndex = state.getCurrentStepIndex();
      const allSteps = state.getSteps();
      const nextStep = allSteps[currentStepIndex + 1];

      if (!nextStep) {
        throw new Error(`Next step not found`);
      }

      const stepDependencies = {
        ...pick(depGroups, nextStep.actions),
      } as Record<string, JSONSchema>;

      stepDependencies["decision"] = this.decision();
      stepDependencies["action"] = this.action();

      // Make decision required for next state transitions
      return this.common(stepDependencies);
    },

    forToolDescription: function (
      description: string,
      state: WorkflowState,
    ): string {
      const enforceToolArgs = this.forCurrentState(state);
      const initTitle = predefinedSteps
        ? `**YOU MUST execute this tool with following tool arguments to init the workflow**
NOTE: The \`steps\` has been predefined`
        : `**You MUST execute this tool with following tool arguments to plan and init the workflow**`;

      return CompiledPrompts.workflowToolDescription({
        description: description,
        initTitle: initTitle,
        ensureStepActions: formatEnsureStepActions(),
        schemaDefinition: JSON.stringify(enforceToolArgs, null, 2),
      });
    },

    forInitialStepDescription: function (
      steps: MCPCStep[],
      state: WorkflowState,
    ): string {
      return CompiledPrompts.workflowInit({
        stepCount: steps.length.toString(),
        currentStepDescription: state.getCurrentStep()?.description || "",
        toolName: name,
        schemaDefinition: JSON.stringify(this.forCurrentState(state), null, 2),
        // Remove redundant workflow steps display
        workflowSteps: "",
      });
    },
  };
}
