import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ComposableMCPServer } from "../../compose.ts";
import { CompiledPrompts } from "../../prompts/index.ts";
import { WorkflowExecutor } from "../workflow/workflow-executor.ts";
import type { MCPCStep, WorkflowState } from "../../utils/state.ts";
import type { ArgsDefCreator } from "../../types.ts";
import {
  BaseSamplingExecutor,
  type ExternalTool,
  type SamplingConfig,
} from "./base-sampling-executor.ts";

export class WorkflowSamplingExecutor extends BaseSamplingExecutor {
  private workflowExecutor: WorkflowExecutor;

  constructor(
    name: string,
    description: string,
    allToolNames: string[],
    toolNameToDetailList: [string, ExternalTool][],
    private createArgsDef: ArgsDefCreator,
    server: ComposableMCPServer,
    private predefinedSteps?: MCPCStep[],
    config?: SamplingConfig,
  ) {
    super(
      name,
      description,
      allToolNames,
      toolNameToDetailList,
      server,
      config,
    );

    // Create WorkflowExecutor for workflow management
    this.workflowExecutor = new WorkflowExecutor(
      name,
      allToolNames,
      toolNameToDetailList as [string, unknown][],
      createArgsDef,
      server,
      predefinedSteps,
    );
  }

  async executeWorkflowSampling(
    args: Record<string, unknown>,
    schema: Record<string, unknown>,
    state: WorkflowState,
  ): Promise<CallToolResult> {
    const validationResult = this.validateSchema(args, schema);
    if (!validationResult.valid) {
      return {
        content: [
          {
            type: "text",
            text: CompiledPrompts.errorResponse({
              errorMessage: validationResult.error || "Validation failed",
            }),
          },
        ],
        isError: true,
      };
    }

    return await this.runSamplingLoop(
      () => this.buildWorkflowSystemPrompt(args, state),
      schema,
      state,
    );
  }

  protected async processAction<TState>(
    parsedData: Record<string, unknown>,
    _schema: Record<string, unknown>,
    state: TState,
  ): Promise<CallToolResult> {
    const workflowState = state as WorkflowState;
    if (!workflowState) {
      throw new Error("WorkflowState is required for workflow");
    }

    const toolCallData = parsedData as Record<string, unknown>;

    if (toolCallData.action === "complete") {
      const reasoning = (toolCallData.reasoning as string) || "Task completed";
      return this.createCompletionResult(reasoning);
    }

    try {
      // Use WorkflowExecutor to handle all workflow logic
      const workflowResult = await this.workflowExecutor.execute(
        parsedData,
        workflowState,
      );

      // Extract result text using the same approach as WorkflowExecutor
      const resultText = workflowResult.content
        ?.filter((content) => content.type === "text")
        ?.map((content) => content.text)
        ?.join("\n") || "No result";

      // Add conversation history updates following agentic pattern
      this.conversationHistory.push({
        role: "assistant",
        content: {
          type: "text",
          text: resultText,
        },
      });

      return workflowResult;
    } catch (error) {
      // Handle execution errors using base class method
      return this.createExecutionError(error);
    }
  }

  private buildWorkflowSystemPrompt(
    args: Record<string, unknown>,
    state: WorkflowState,
  ): string {
    // Get the current workflow schema from WorkflowExecutor
    const workflowSchema = this.createArgsDef.forCurrentState(state);

    // Use the SystemPrompts.WORKFLOW_EXECUTION as base instead of custom prompt
    const basePrompt = CompiledPrompts.samplingWorkflowExecution({
      toolName: this.name,
      description: this.description,
      workflowSchema: `${JSON.stringify(workflowSchema, null, 2)}`,
    });

    // Create workflow-specific sampling prompt using existing patterns
    const workflowPrompt =
      `\n\nCurrent Task: <user_request>${args.userRequest}</user_request>`;

    // Use JSON instruction injection pattern
    return this.injectJsonInstruction({
      prompt: basePrompt + workflowPrompt,
      schema: workflowSchema,
    });
  }
}
