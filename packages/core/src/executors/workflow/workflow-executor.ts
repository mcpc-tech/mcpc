import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ajv } from "ajv";
import { AggregateAjvError } from "@segment/ajv-human-errors";
import addFormats from "ajv-formats";
import type { MCPCStep } from "../../utils/state.ts";
import type { WorkflowState } from "../../utils/state.ts";
import type { ArgsDefCreator } from "../../types.ts";
import type { ComposableMCPServer } from "../../compose.ts";
import {
  CompiledPrompts,
  PromptUtils,
  WorkflowPrompts,
} from "../../prompts/index.ts";

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
    private predefinedSteps?: MCPCStep[],
    private ensureStepActions?: string[],
    private toolNameToIdMapping?: Map<string, string>,
  ) {}

  // Helper method to validate required actions are present in workflow steps
  private validateRequiredActions(steps: MCPCStep[]): {
    valid: boolean;
    missing: string[];
  } {
    if (!this.ensureStepActions || this.ensureStepActions.length === 0) {
      return { valid: true, missing: [] };
    }

    const allStepActions = new Set<string>();
    steps.forEach((step) => {
      step.actions.forEach((action) => allStepActions.add(action));
    });

    const missing: string[] = [];

    for (const requiredAction of this.ensureStepActions) {
      // Check if the action exists directly
      if (allStepActions.has(requiredAction)) {
        continue;
      }

      // If we have the mapping, try to find the corresponding toolId
      if (this.toolNameToIdMapping) {
        const mappedToolId = this.toolNameToIdMapping.get(requiredAction);
        if (mappedToolId && allStepActions.has(mappedToolId)) {
          continue;
        }
      }

      // If neither direct match nor mapped match found, it's missing
      missing.push(requiredAction);
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  // Helper method to format workflow progress
  private formatProgress(state: WorkflowState): string {
    const progressData = state.getProgressData();
    return PromptUtils.formatWorkflowProgress(progressData);
  }

  async execute(
    args: Record<string, unknown>,
    state: WorkflowState,
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
                ? WorkflowPrompts.ERRORS.NOT_INITIALIZED.WITH_PREDEFINED
                : WorkflowPrompts.ERRORS.NOT_INITIALIZED.WITHOUT_PREDEFINED,
            },
          ],
          isError: true,
        };
      }

      const decision = args.decision as string;

      if (decision === "proceed") {
        // Allow proceeding to completion even when at the last step
        if (
          !state.hasNextStep() &&
          state.isAtLastStep() &&
          state.isWorkflowStarted()
        ) {
          // Mark the workflow as completed and provide completion message
          state.markCompleted();
          return {
            content: [
              {
                type: "text",
                text: `## Workflow Completed!\n\n${
                  this.formatProgress(
                    state,
                  )
                }\n\n${
                  CompiledPrompts.workflowCompleted({
                    totalSteps: state.getSteps().length,
                    toolName: this.name,
                    newWorkflowInstructions: this.predefinedSteps
                      ? ""
                      : " and new `steps` array",
                  })
                }`,
              },
            ],
            isError: false,
          };
        }

        if (!state.hasNextStep() && !state.isAtLastStep()) {
          return {
            content: [
              {
                type: "text",
                text: WorkflowPrompts.ERRORS.ALREADY_AT_FINAL,
              },
            ],
            isError: true,
          };
        }

        // Temporarily move to next step for validation, but be ready to roll back
        const currentStepIndex = state.getCurrentStepIndex();
        const wasStarted = state.isWorkflowStarted();

        if (state.isWorkflowStarted()) {
          state.moveToNextStep();
        } else {
          state.start();
        }

        // Validate arguments for the new current step (next step)
        const nextStepValidationSchema = this.createArgsDef.forCurrentState(
          state,
        );
        const nextStepValidationResult = this.validate(
          args,
          nextStepValidationSchema,
        );

        if (!nextStepValidationResult.valid) {
          // Roll back the step movement on validation failure
          if (wasStarted) {
            state.moveToStep(currentStepIndex);
          } else {
            // Reset to unstarted state
            state.moveToStep(currentStepIndex);
            // We can't easily "unstart" the workflow, but we can reset to beginning state
            // This is an edge case that should rarely happen
          }

          return {
            content: [
              {
                type: "text",
                text: CompiledPrompts.workflowErrorResponse({
                  errorMessage: `Cannot proceed to next step: ${
                    nextStepValidationResult.error ||
                    "Arguments validation failed"
                  }`,
                }),
              },
            ],
            isError: true,
          };
        }
        // If validation passes, we've already moved to the next step above
      } else if (decision === "complete") {
        // Only allow completion at final step or when at last step and started
        if (
          (state.isAtLastStep() && state.isWorkflowStarted()) ||
          (!state.hasNextStep() && state.isWorkflowStarted())
        ) {
          state.markCompleted();
          return {
            content: [
              {
                type: "text",
                text: `## Workflow Completed!\n\n${
                  this.formatProgress(
                    state,
                  )
                }\n\n${
                  CompiledPrompts.workflowCompleted({
                    totalSteps: state.getSteps().length,
                    toolName: this.name,
                    newWorkflowInstructions: this.predefinedSteps
                      ? ""
                      : " and new `steps` array",
                  })
                }`,
              },
            ],
            isError: false,
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: WorkflowPrompts.ERRORS.ALREADY_AT_FINAL,
              },
            ],
            isError: true,
          };
        }
      }
      // When decision is "retry" or undefined, stay at current step (retry)
    }

    // Validate arguments based on current state
    // Note: For "proceed", validation was already done above in the decision handling
    // Here we only validate for "retry" or undefined decisions
    const decision = args.decision as string;
    if (decision !== "proceed") {
      const validationSchema = this.createArgsDef.forCurrentState(state);

      const validationResult = this.validate(args, validationSchema);
      if (!validationResult.valid) {
        return {
          content: [
            {
              type: "text",
              text: CompiledPrompts.workflowErrorResponse({
                errorMessage: validationResult.error ||
                  "Arguments validation failed",
              }),
            },
          ],
          isError: true,
        };
      }
    }

    if (args.init) {
      return this.initialize(args, state);
    }

    return await this.executeStep(args, state);
  }

  initialize(
    args: Record<string, unknown>,
    state: WorkflowState,
  ): CallToolResult {
    // Allow step redefinition when args.steps is provided, even with predefined steps
    const steps = (args.steps as Array<MCPCStep>) ?? this.predefinedSteps;

    if (!steps || steps.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: WorkflowPrompts.ERRORS.NO_STEPS_PROVIDED,
          },
        ],
        isError: true,
      };
    }

    // Validate that required actions are present in the workflow steps
    const validation = this.validateRequiredActions(steps);
    if (!validation.valid) {
      return {
        content: [
          {
            type: "text",
            text: `## Workflow Validation Failed ❌

**Missing Required Actions:** The following actions must be included in the workflow steps:

${
              validation.missing
                .map((action) =>
                  `- \`${this.toolNameToIdMapping?.get(action) ?? action}\``
                )
                .join("\n")
            }`,
          },
        ],
        isError: true,
      };
    }

    state.initialize(steps);

    // The initial next step is the first one of the steps.
    return {
      content: [
        {
          type: "text",
          text: `## Workflow Initialized
${this.formatProgress(state)}
${this.createArgsDef.forInitialStepDescription(steps, state)}`,
        },
      ],
      isError: false,
    };
  }

  async executeStep(
    args: Record<string, unknown>,
    state: WorkflowState,
  ): Promise<CallToolResult> {
    const currentStep = state.getCurrentStep();
    if (!currentStep) {
      return {
        content: [
          {
            type: "text",
            text: WorkflowPrompts.ERRORS.NO_CURRENT_STEP,
          },
        ],
        isError: true,
      };
    }

    // Mark current step as running
    state.markCurrentStepRunning();

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
          actionArgs,
        )) as CallToolResult;

        if (!results.isError) {
          results.isError = actionResult.isError;
        }

        // Extract text content from action result using prompt utility
        const extractedText = PromptUtils.extractActionResultText(actionResult);

        results.content.push({
          type: "text",
          text: `Action \`${action}\` executed ${
            actionResult.isError ? "❌ **FAILED**" : "✅ **SUCCESS**"
          }:\n${extractedText}`,
        });
      } catch (error) {
        results.content.push({
          type: "text",
          text: `Action \`${action}\` ❌ **FAILED** with error: `,
        });
        results.content.push({
          type: "text",
          text: `${(error as Error).message}`,
        });
        results.isError = true;
      }
    }

    // Mark step completion status
    if (results.isError) {
      state.markCurrentStepFailed("Step execution failed");
    } else {
      state.markCurrentStepCompleted("Step completed successfully");
    }

    if (state.hasNextStep()) {
      const nextStepArgsDef = this.createArgsDef.forNextState(state);
      results.content.push({
        type: "text",
        text: CompiledPrompts.nextStepDecision({
          toolName: this.name,
          nextStepDescription: state.getNextStep()?.description ||
            "Unknown step",
          nextStepSchema: JSON.stringify(nextStepArgsDef, null, 2),
        }),
      });
    } else {
      // Auto-complete workflow when final step is reached
      if (!results.isError) {
        results.content.push({
          type: "text",
          text: CompiledPrompts.workflowCompleted({
            totalSteps: state.getSteps().length,
            toolName: this.name,
            newWorkflowInstructions: this.predefinedSteps
              ? ""
              : " and new `steps` array",
          }),
        });
      } else {
        // Show completion prompt only if there were errors
        results.content.push({
          type: "text",
          text: CompiledPrompts.finalStepCompletion({
            statusIcon: "❌",
            statusText: "with errors",
            toolName: this.name,
            newWorkflowInstructions: this.predefinedSteps
              ? ""
              : " and new `steps` array",
          }),
        });
      }
    }

    // Add final progress display
    results.content.push({
      type: "text",
      text: `## Workflow Progress
${this.formatProgress(state)}`,
    });

    return results;
  }

  // Validate arguments using JSON schema
  validate(
    args: Record<string, unknown>,
    schema: Record<string, unknown>,
  ): {
    valid: boolean;
    error?: string;
  } {
    const validate = ajv.compile(schema);
    if (!validate(args)) {
      const errors = new AggregateAjvError(validate.errors!);
      return {
        valid: false,
        error: errors.message,
      };
    }
    return { valid: true };
  }
}
