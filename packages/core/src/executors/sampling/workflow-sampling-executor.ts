import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ComposableMCPServer } from "../../compose.ts";
import type { SamplingConfig } from "../../types.ts";
import { CompiledPrompts } from "../../prompts/index.ts";
import { WorkflowExecutor } from "../workflow/workflow-executor.ts";
import type { MCPCStep, WorkflowState } from "../../utils/state.ts";
import type { ArgsDefCreator } from "../../types.ts";
import type { Span } from "@opentelemetry/api";
import {
  BaseSamplingExecutor,
  type ExternalTool,
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
            text: CompiledPrompts.workflowErrorResponse({
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
    parentSpan?: Span | null,
  ): Promise<CallToolResult> {
    const workflowState = state as WorkflowState;
    if (!workflowState) {
      throw new Error("WorkflowState is required for workflow");
    }

    const toolCallData = parsedData as Record<string, unknown>;
    const isComplete = toolCallData.decision === "complete";
    const actionName = toolCallData.action as string;

    // Treat "complete with action" as "proceed" so the action executes
    // and LLM can see the result (important if action fails and needs retry)
    if (isComplete && actionName && actionName !== "complete") {
      this.logger.debug({
        message:
          "Decision is 'complete' with action present, treating as 'proceed'",
        action: actionName,
      });
      toolCallData.decision = "proceed";
    }

    if (toolCallData.decision === "complete") {
      return await this.createCompletionResult("Task completed", parentSpan);
    }

    try {
      const workflowResult = await this.workflowExecutor.execute(
        parsedData,
        workflowState,
      );

      const resultText = workflowResult.content
        ?.filter((content) => content.type === "text")
        ?.map((content) => content.text)
        ?.join("\n") || "No result";

      this.conversationHistory.push({
        role: "assistant",
        content: {
          type: "text",
          text: resultText,
        },
      });

      return workflowResult;
    } catch (error) {
      return this.createExecutionError(error, parentSpan);
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
    let contextInfo = "";
    if (
      args.context && typeof args.context === "object" &&
      Object.keys(args.context).length > 0
    ) {
      contextInfo = `\n\nContext:\n${JSON.stringify(args.context, null, 2)}`;
    }
    const workflowPrompt =
      `\n\nCurrent Task: <user_request>${args.userRequest}</user_request>${contextInfo}`;

    // Use JSON instruction injection pattern
    return this.injectJsonInstruction({
      prompt: basePrompt + workflowPrompt,
      schema: workflowSchema,
    });
  }
}
