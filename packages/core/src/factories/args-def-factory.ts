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
): ArgsDefCreator {
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
        `**Step control: \`${DECISION_OPTIONS.PROCEED}\` = next step, \`${DECISION_OPTIONS.RETRY}\` = retry current, \`${DECISION_OPTIONS.COMPLETE}\` = finish workflow**`,
    }),

    action: (): JSONSchema => ({
      type: "string",
      description: "Define the current workflow action to be performed",
      enum: allToolNames,
      required: ["action"],
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
        },
        required: ["userRequest"],
      };
    },

    forAgentic: function (
      toolNameToDetailList: [string, unknown][],
      sampling: boolean = false,
      ACTION_KEY: string = "action",
      NEXT_ACTION_KEY: string = "nextAction",
    ): JSONSchema {
      const allOf = toolNameToDetailList.map(
        ([toolName, _toolDetail]: [string, unknown]) => {
          return {
            if: {
              properties: { [ACTION_KEY]: { const: toolName } },
              required: [ACTION_KEY],
            },
            then: {
              required: [toolName],
            },
          };
        },
      );

      const actionDescription =
        "Specifies the action to be performed from the enum. Based on the value chosen for 'action', the corresponding sibling property (which shares the same name as the action value and contains its specific parameters) **MUST** also be provided in this object. For example, if 'action' is 'get_weather', then the 'get_weather' parameter object is mandatory.";

      const baseProperties = {
        [ACTION_KEY]: {
          type: "string",
          enum: allToolNames,
          description: actionDescription,
        },
        [NEXT_ACTION_KEY]: {
          type: "string",
          enum: allToolNames,
          description:
            "Specify the next action to execute only when the user's request requires additional steps. If no next action is needed, this property **MUST BE OMITTED** from the object.",
        },
        decision: this.decision(),
        ...depGroups,
      };

      // Add reasoning field for sampling mode
      if (sampling) {
        baseProperties.reasoning = {
          type: "string",
          description: "Explain your reasoning for this action",
        };
      }

      const requiredFields = [ACTION_KEY, "decision"];

      return {
        additionalProperties: false,
        allOf,
        type: "object",
        properties: baseProperties,
        required: requiredFields,
      };
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
