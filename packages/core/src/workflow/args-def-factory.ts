import { pick } from "@es-toolkit/es-toolkit";
import type { MCPCStep, WorkflowState } from "../utils/state.ts";
import type { JSONSchema, ArgsDefCreator } from "../types.ts";

export function createArgsDefFactory(
  name: string,
  allToolNames: string[],
  depGroups: Record<string, unknown>,
  predefinedSteps?: MCPCStep[]
): ArgsDefCreator {
  return {
    common: (
      extra: { [n: string]: JSONSchema },
      optionalFields: string[] = []
    ): JSONSchema => {
      const requiredFields = Object.keys(extra).filter(
        (key) => !optionalFields.includes(key)
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
        description: `A single step containing actions that execute concurrently. All actions in this step run simultaneously with no guaranteed order.`,
        properties: {
          description: {
            type: "string",
            description: `**Step purpose, required inputs, and expected outputs**`,
          },
          actions: {
            type: "array",
            description: `Array of action names that execute concurrently in this step.`,
            items: {
              ...{
                enum: allToolNames,
              },
              type: "string",
              description: `Individual action name from available actions`,
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

    proceed: (): JSONSchema => ({
      type: "boolean",
      description:
        "**Step execution control. Set \`true\` to advance, \`false\`/omit to retry. ⚠️ CRITICAL: For failed steps, NEVER use \`true\`**",
    }),

    forTool: function (): JSONSchema {
      return this.common({});
    },

    forCurrentState: function (state: WorkflowState): JSONSchema {
      if (!state.isWorkflowInitialized()) {
        if (predefinedSteps) {
          return this.common({
            init: this.init(),
          });
        }
        return this.common({
          steps: this.steps(),
          init: this.init(),
        });
      }

      const currentStep = state.getCurrentStep();
      if (!currentStep) {
        throw new Error(
          `Invalid workflow state: no current step, ${JSON.stringify(
            state.getDebugInfo()
          )}`
        );
      }

      const stepDependencies = {
        ...pick(depGroups, currentStep.actions),
      } as Record<string, JSONSchema>;

      stepDependencies["proceed"] = this.proceed();

      return this.common(stepDependencies, ["proceed"]);
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

      stepDependencies["proceed"] = this.proceed();

      return this.common(stepDependencies);
    },

    forToolDescription: function (
      description: string,
      state: WorkflowState
    ): string {
      const enforceToolArgs = this.forCurrentState(state);
      const title = predefinedSteps
        ? `**YOU MUST execute this tool with following tool arguments to init the workflow**
NOTE: The \`steps\` has been predefined`
        : `**You MUST execute this tool with following tool arguments to plan and init the workflow**`;

      return `${description}
${title}
${JSON.stringify(enforceToolArgs, null, 2)}`;
    },

    forInitialStepDescription: function (
      steps: MCPCStep[],
      state: WorkflowState
    ): string {
      return (
        `Workflow initialized with ${
          steps.length
        } steps. You MUST start the workflow with the first step to \`${
          state.getCurrentStep()?.description
        }\`. 
              
## EXECUTE tool \`${name}\` with following new tool arguments

${JSON.stringify(this.forCurrentState(state), null, 2)}

## Important Instructions
- **Include 'steps' parameter ONLY when restarting workflow (with 'init: true')**
- **Do NOT include 'steps' parameter during normal step execution**
- **MUST Use the provided JSON schema definition above for parameter generation and validation**
- **ADVANCE STEP: Set 'proceed' to true to advance to next step**
- **RETRY STEP: Set 'proceed' to false or omit it to re-execute current step**
- **⚠️ CRITICAL: When retrying failed steps, NEVER set 'proceed' to true**
` +
        (predefinedSteps
          ? `## Workflow Steps\n${JSON.stringify(steps, null, 2)}`
          : "")
      );
    },
  };
}
