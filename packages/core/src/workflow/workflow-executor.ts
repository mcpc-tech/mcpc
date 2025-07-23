import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ajv } from "ajv";
import { AggregateAjvError } from "@segment/ajv-human-errors";
import addFormats from "ajv-formats";
import type { MCPCStep, WorkflowState } from "../utils/state.ts";
import type { ArgsDefCreator } from "../types.ts";

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
    private predefinedSteps?: MCPCStep[],
    private executeToolCallback?: (toolName: string, args: Record<string, unknown>) => Promise<CallToolResult>
  ) {}

  async execute(args: Record<string, unknown>, state: WorkflowState): Promise<CallToolResult> {
    // Handle direct action execution mode
    if (args.executeAction === true) {
      return await this.executeDirectAction(args);
    }

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

  initialize(args: Record<string, unknown>, state: WorkflowState): CallToolResult {
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
            this.predefinedSteps ?? args.steps as MCPCStep[],
            state
          ),
        },
      ],
      isError: false,
    };
  }

  async executeStep(args: Record<string, unknown>, state: WorkflowState): Promise<CallToolResult> {
    const currentStep = state.getCurrentStep();
    if (!currentStep) {
      return {
        content: [
          { type: "text", text: "Error: No current step to execute" },
        ],
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
        const currentTool = this.toolNameToDetailList.find(
          ([toolName]: [string, unknown]) => toolName === action
        )?.[1] as { execute: (args: unknown) => Promise<CallToolResult> } | undefined;

        if (!currentTool) {
          throw new Error(`Tool ${action} not found`);
        }

        const actionArgs = args[action] || {};
        const actionResult = await currentTool.execute(actionArgs);

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
        text: `You **MUST** decide whether to proceed to the next step to \`${
          state.getNextStep()?.description
        }\`.
To retry, **You MUST EXECUTE tool \`${this.name}\` with current step's arguments
To proceed, You MUST EXECUTE tool \`${this.name}\` with the following tool arguments, ensuring the proceed parameter is set to true:

${JSON.stringify(nextStepArgsDef, null, 2)}

**Instructions:**
- Analyze the previous action's result carefully
- Determine if the next step is necessary and appropriate
- **Exclude the \`steps\` key from your generated parameters**`,
      });
    } else {
      results.content.push({
        type: "text",
        text: `Workflow completed. All steps have been executed.

The result of the final step is shown above. Based on this result, please choose your next action from the options below:

1.  **✅ Conclude and Finish:** If the result meets all expectations, provide the final answer or summary to the user directly. **Do not call this tool again.**

2.  **🔄 Retry the Final Step:** If the result of the final step is unsatisfactory or incorrect, you **CAN retry it** by calling this tool again with the required arguments for this last step.

3.  **🆕 Start a New Workflow:** If you need to start a brand new task from scratch, you **MUST** call this tool to initialize a new workflow`,
      });
    }

    return results;
  }

  private async executeDirectAction(args: Record<string, unknown>): Promise<CallToolResult> {
    // Find the tool to execute (any parameter except executeAction)
    const toolEntries = Object.entries(args).filter(([key]) => key !== 'executeAction');
    
    if (toolEntries.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `Error: No tool specified for direct action execution. Please provide a tool name as a parameter.`,
          },
        ],
        isError: true,
      };
    }

    if (toolEntries.length > 1) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Multiple tools specified for direct action execution. Please provide only one tool at a time. Found: ${toolEntries.map(([key]) => key).join(', ')}`,
          },
        ],
        isError: true,
      };
    }

    const [toolName, toolArgs] = toolEntries[0];
    
    try {
      // Try to find the tool in the toolNameToDetailList first
      const currentTool = this.toolNameToDetailList.find(
        ([name]: [string, unknown]) => name === toolName
      )?.[1] as { execute: (args: unknown) => Promise<CallToolResult> } | undefined;

      if (currentTool) {
        // Execute external tool
        const result = await currentTool.execute(toolArgs);
        return result;
      }

      // If not found in external tools and executeToolCallback is available, try internal tools
      if (this.executeToolCallback) {
        const result = await this.executeToolCallback(toolName, toolArgs as Record<string, unknown>);
        return result;
      }

      // Tool not found
      return {
        content: [
          {
            type: "text",
            text: `Error: Tool "${toolName}" not found. Available tools: ${this.allToolNames.join(', ')}`,
          },
        ],
        isError: true,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error executing tool "${toolName}": ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
}
