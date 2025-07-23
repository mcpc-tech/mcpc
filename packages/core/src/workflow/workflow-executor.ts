import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ajv } from "ajv";
import { AggregateAjvError } from "@segment/ajv-human-errors";
import addFormats from "ajv-formats";
import type { MCPCStep, WorkflowState } from "../utils/state.ts";
import type { ArgsDefCreator } from "../types.ts";
import type { ComposableMCPServer } from "../compose.ts";

const ajv = new Ajv({
  allErrors: true,
  verbose: true,
});
// @ts-ignore -
addFormats(ajv);

export class WorkflowExecutor {
  constructor(
    private name: string,
    private allToolNames: string[],
    private toolNameToDetailList: [string, unknown][],
    private createArgsDef: ArgsDefCreator,
    private server: ComposableMCPServer,
    private predefinedSteps?: MCPCStep[]
  ) {}

  async execute(
    args: Record<string, unknown>,
    state: WorkflowState
  ): Promise<CallToolResult> {
    if (args.init) {
      state.reset();
    } else {
      if (!state.isWorkflowInitialized() && !args.init) {
        return {
          content: [
            {
              type: "text",
              text: this.predefinedSteps
                ? "Error: Workflow not initialized. Please provide 'init' parameter to start a new workflow."
                : `"Error: Workflow not initialized. Please provide 'init' and 'steps' parameter to start a new workflow."`,
            },
          ],
          isError: true,
        };
      }

      if (args.proceed === true) {
        if (!state.hasNextStep() && !state.isAtLastStep()) {
          return {
            content: [
              {
                type: "text",
                text: "Error: Cannot proceed, you are already at the final step.",
              },
            ],
            isError: true,
          };
        }
        if (state.isWorkflowStarted()) {
          state.moveToNextStep();
        } else {
          state.start();
        }
      }
    }

    const validationSchema = this.createArgsDef.forCurrentState(state);
    const validate = ajv.compile(validationSchema);
    if (!validate(args)) {
      const errors = new AggregateAjvError(validate.errors!);
      return {
        content: [
          {
            type: "text",
            text: `Tool call arguments validation failed: ${errors.message}`,
          },
        ],
        isError: true,
      };
    }

    if (args.init) {
      return this.initialize(args, state);
    }

    return await this.executeStep(args, state);
  }

  initialize(
    args: Record<string, unknown>,
    state: WorkflowState
  ): CallToolResult {
    const steps = (this.predefinedSteps ?? args.steps) as Array<MCPCStep>;

    if (!steps || steps.length === 0) {
      return {
        content: [{ type: "text", text: "Error: No steps provided" }],
        isError: true,
      };
    }

    state.initialize(steps);

    // The initial next step is the first one of the steps.
    return {
      content: [
        {
          type: "text",
          text: this.createArgsDef.forInitialStepDescription(
            this.predefinedSteps ?? (args.steps as MCPCStep[]),
            state
          ),
        },
      ],
      isError: false,
    };
  }

  async executeStep(
    args: Record<string, unknown>,
    state: WorkflowState
  ): Promise<CallToolResult> {
    const currentStep = state.getCurrentStep();
    if (!currentStep) {
      return {
        content: [{ type: "text", text: "Error: No current step to execute" }],
        isError: true,
      };
    }

    const results: CallToolResult = {
      content: [],
      isError: false,
    };

    // Execute all actions in the current step
    for (const action of currentStep.actions) {
      try {
        const actionArgs = args[action] || {};
        const actionResult = (await this.server.callTool(
          action,
          actionArgs
        )) as CallToolResult;

        if (!results.isError) {
          results.isError = actionResult.isError;
        }

        results.content.push({
          type: "text",
          text: `Action \`${action}\` excuted with result: `,
        });
        results.content.push({
          type: "text",
          text: `${JSON.stringify(actionResult, null, 2)}`,
        });
      } catch (error) {
        results.content.push({
          type: "text",
          text: `Action \`${action}\` failed with error: `,
        });
        results.content.push({
          type: "text",
          text: `${(error as Error).message}`,
        });
        results.isError = true;
      }
    }

    if (state.hasNextStep()) {
      const nextStepArgsDef = this.createArgsDef.forNextState(state);
      results.content.push({
        type: "text",
        text: `**Next Step Decision Required**

Previous step completed. Choose your action:

**🔄 RETRY Current Step:** 
- Call \`${this.name}\` with current parameters
- ⚠️ CRITICAL: Set \`proceed: false\` OR omit \`proceed\` parameter

**▶️ PROCEED to Next Step:** 
- Call \`${this.name}\` with parameters below
- Set \`proceed: true\`

Next step: \`${state.getNextStep()?.description}\`

${JSON.stringify(nextStepArgsDef, null, 2)}

**Important:** Exclude \`steps\` key from your parameters`,
      });
    } else {
      results.content.push({
        type: "text",
        text: `**Workflow Complete** ✅

All steps executed successfully. Choose your next action:

**1. ✅ Finish:** Provide final summary to user (don't call this tool)
**2. 🔄 Retry Final Step:** Call \`${this.name}\` with final step parameters  
**3. 🆕 New Workflow:** Call \`${this.name}\` with \`init: true\`${
          this.predefinedSteps ? "" : " and new \`steps\` array"
        }`,
      });
    }

    return results;
  }
}
