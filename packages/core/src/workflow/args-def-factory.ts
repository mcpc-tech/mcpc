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
    common: (extra: { [n: string]: JSONSchema }, optionalFields: string[] = []): JSONSchema => {
      const requiredFields = Object.keys(extra).filter(key => !optionalFields.includes(key));
      return {
        type: "object",
        description: `**Tool arguments structured according to the step's JSON Schema definition; it's DYNAMIC and will update for each step**`,
        properties: {
          ...extra,
        },
        required: requiredFields,
      };
    },

    steps: (): JSONSchema => ({
      type: "array",
      description: `
An array of step objects that defines the complete sequence of actions for a workflow. This array should be provided only on the initial call, unless a workflow restart is required.

CRITICAL:
-   **Workflow as a Sequence of States**: Steps MUST be organized to reflect the workflow's logical sequence. Each step represents a distinct phase.
-   **Sequential Dependency Rule**: If Action B depends on the outcome of Action A, they MUST be in separate, sequential steps (A in Step N, B in Step N+1).
-   **Concurrent Action Rule**: All actions within a single step are considered independent and MUST be executable concurrently.
-   **Action Fidelity Rule**: The set of generated actions MUST be a complete and faithful one-to-one mapping of the operations requested in the user's description. Do NOT omit requested ones.
-   **Predefined steps**: MUST remain unspecified if predefined steps are present

BEST PRACTICES:
-   **Atomicity**: A step should be as atomic as possible.
-   **Idempotency**: Actions should be designed to be idempotent for safe retries.
-   **Clarity over Brevity**: Prefer more, smaller, focused steps over fewer, complex ones.`,
      items: {
        type: "object",
        description: `A single step containing actions that execute concurrently. All actions in this step run simultaneously with no guaranteed order.`,
        properties: {
          description: {
            type: "string",
            description: `**Describes what a step does, what it needs from previous steps or context, and what it outputs.**`,
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
        "**Controls step execution flow. MUST be set to `true` to advance to the next step. If omitted or false, this step will be re-executed with the provided arguments**",
    }),

    // Direct call support - allows LLM to directly call any available tool
    executeAction: (): JSONSchema => ({
      type: "boolean",
      description: `**Direct action execution mode. Set to true when you want to execute a specific action directly without going through the workflow process.**`,
    }),

    forTool: function(): JSONSchema {
      return this.common({});
    },

    forCurrentState: function(state: WorkflowState): JSONSchema {
      if (!state.isWorkflowInitialized()) {
        if (predefinedSteps) {
          return this.common({ 
            init: this.init(),
            executeAction: this.executeAction()
          }, ["executeAction"]);
        }
        return this.common({
          steps: this.steps(),
          init: this.init(),
          executeAction: this.executeAction()
        }, ["executeAction"]);
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
      stepDependencies["executeAction"] = this.executeAction();

      return this.common(stepDependencies, ["proceed", "executeAction"]);
    },

    forNextState: function(state: WorkflowState): JSONSchema {
      if (!state.isWorkflowInitialized() || !state.hasNextStep()) {
        throw new Error(
          `Cannot get next state schema: no next step available`
        );
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

    forToolDescription: function(description: string, state: WorkflowState): string {
      const enforceToolArgs = this.forCurrentState(state);
      const title = predefinedSteps
        ? `**YOU MUST execute this tool with following tool arguments to init the workflow**
NOTE: The \`steps\` has been predefined`
        : `**You MUST execute this tool with following tool arguments to plan and init the workflow**`;

      return `${description}
${title}
${JSON.stringify(enforceToolArgs, null, 2)}`;
    },

    forInitialStepDescription: function(steps: MCPCStep[], state: WorkflowState): string {
      return `Workflow initialized with ${
        steps.length
      } steps. You MUST start the workflow with the first step to \`${
        state.getCurrentStep()?.description
      }\`. 
              
## EXECUTE tool \`${name}\` with following new tool arguments

${JSON.stringify(this.forCurrentState(state))}

## Important Instructions
- **Do NOT include 'steps' parameter in any subsequent tool calls**
- **MUST Use the provided JSON schema definition above for parameter generation and validation**
` +
      (predefinedSteps
        ? `## Workflow Steps\n${JSON.stringify(steps, null, 2)}`
        : "");
    }
  };
}
