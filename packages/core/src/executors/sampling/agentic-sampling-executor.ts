import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ComposableMCPServer } from "../../compose.ts";
import type { SamplingConfig } from "../../types.ts";
import { CompiledPrompts } from "../../prompts/index.ts";
import { AgenticExecutor } from "../agentic/agentic-executor.ts";
import { createArgsDefFactory } from "../../factories/args-def-factory.ts";
import type { Span } from "@opentelemetry/api";
import {
  BaseSamplingExecutor,
  type ExternalTool,
} from "./base-sampling-executor.ts";
import { validateSchema } from "../../utils/schema-validator.ts";

export class SamplingExecutor extends BaseSamplingExecutor {
  private agenticExecutor: AgenticExecutor;

  constructor(
    name: string,
    description: string,
    allToolNames: string[],
    toolNameToDetailList: [string, ExternalTool][],
    server: ComposableMCPServer,
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

    // Create AgenticExecutor for tool execution
    this.agenticExecutor = new AgenticExecutor(
      name,
      allToolNames,
      toolNameToDetailList as [string, unknown][],
      server,
    );
  }

  private buildDepGroups(): Record<string, unknown> {
    const depGroups: Record<string, unknown> = {};

    this.toolNameToDetailList.forEach(([toolName, tool]) => {
      if (tool?.inputSchema) {
        depGroups[toolName] = {
          type: "object",
          description: tool.description || `Tool: ${toolName}`,
          ...tool.inputSchema,
        };
      } else {
        // Check if it's a hidden tool
        const toolSchema = this.server.getHiddenToolSchema(toolName);
        if (toolSchema) {
          depGroups[toolName] = {
            ...toolSchema.schema,
            description: toolSchema.description,
          };
        }
      }
    });

    return depGroups;
  }

  executeSampling(
    args: Record<string, unknown>,
    schema: Record<string, unknown>,
  ) {
    const validationResult = validateSchema(args, schema);
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

    const createArgsDef = createArgsDefFactory(
      this.name,
      this.allToolNames,
      this.buildDepGroups(),
      undefined,
      undefined,
    );

    const agenticSchema = createArgsDef.forAgentic(
      this.toolNameToDetailList as [string, unknown][],
      true,
    );

    const systemPrompt = this.buildSystemPrompt(
      args.userRequest as string,
      agenticSchema,
      (args.context && typeof args.context === "object")
        ? args.context as Record<string, unknown>
        : undefined,
    );
    return this.runSamplingLoop(() => systemPrompt, agenticSchema);
  }

  protected async processAction(
    parsedData: Record<string, unknown>,
    schema: Record<string, unknown>,
    _state?: unknown,
    parentSpan?: Span | null,
  ): Promise<CallToolResult> {
    const toolCallData = parsedData;

    if (toolCallData.decision === "complete") {
      return await this.createCompletionResult("Task completed", parentSpan);
    }

    try {
      const { action: _action, decision: _decision, ..._toolArgs } =
        toolCallData;

      const toolResult = await this.agenticExecutor.execute(
        toolCallData,
        schema,
        parentSpan,
      );

      const resultText = toolResult.content
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

      return toolResult;
    } catch (error) {
      return this.createExecutionError(error, parentSpan);
    }
  }

  private buildSystemPrompt(
    userRequest: string,
    agenticSchema: Record<string, unknown>,
    context?: Record<string, unknown>,
  ): string {
    const toolList = this.allToolNames
      .map((name) => {
        const tool = this.toolNameToDetailList.find(
          ([toolName]) => toolName === name,
        );
        const toolSchema = this.server.getHiddenToolSchema(name);

        if (tool && tool[1]) {
          return `- ${name}: ${tool[1].description || `Tool: ${name}`}`;
        } else if (toolSchema) {
          return `- ${name}: ${toolSchema.description}`;
        }
        return `- ${name}`;
      })
      .join("\n");

    let contextInfo = "";
    if (
      context && typeof context === "object" && Object.keys(context).length > 0
    ) {
      contextInfo = `\n\nContext:\n${JSON.stringify(context, null, 2)}`;
    }

    // Use compiled sampling prompt (mode-aware based on client capabilities)
    const basePrompt = this.supportsSamplingTools()
      ? CompiledPrompts.samplingExecutionTools({
        toolName: this.name,
        description: this.description,
        toolList: toolList,
      })
      : CompiledPrompts.samplingExecution({
        toolName: this.name,
        description: this.description,
        toolList: toolList,
      });

    const taskPrompt = `

## Current Task
You will now use agentic sampling to complete the following task: "${userRequest}"${contextInfo}

When you need to use a tool, specify the tool name in 'useTool' and provide tool-specific parameters as additional properties.`;

    return this.formatPromptForMode({
      prompt: basePrompt + taskPrompt,
      schema: agenticSchema,
    });
  }
}
