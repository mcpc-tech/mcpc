import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ComposableMCPServer } from "../../compose.ts";
import type { SamplingConfig } from "../../types.ts";
import { CompiledPrompts } from "../../prompts/index.ts";
import { AgenticExecutor } from "../agentic/agentic-executor.ts";
import { createArgsDefFactory } from "../../factories/args-def-factory.ts";
import {
  BaseSamplingExecutor,
  type ExternalTool,
} from "./base-sampling-executor.ts";

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
        // Check if it's an internal tool
        const toolSchema = this.server.getInternalToolSchema(toolName);
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
    );
    return this.runSamplingLoop(() => systemPrompt, agenticSchema);
  }

  protected async processAction(
    parsedData: Record<string, unknown>,
    schema: Record<string, unknown>,
  ): Promise<CallToolResult> {
    // Define the expected tool call data structure
    const toolCallData = parsedData;

    if (toolCallData.decision === "complete") {
      return this.createCompletionResult("Task completed");
    }

    try {
      // Extract tool arguments (everything except action and decision)
      const { action: _action, decision: _decision, ..._toolArgs } =
        toolCallData;

      const toolResult = await this.agenticExecutor.execute(
        toolCallData,
        schema,
      );

      // Extract result text
      const resultText = toolResult.content
        ?.filter((content) => content.type === "text")
        ?.map((content) => content.text)
        ?.join("\n") || "No result";

      // Add conversation history updates
      this.conversationHistory.push({
        role: "assistant",
        content: {
          type: "text",
          text: resultText,
        },
      });

      return toolResult;
    } catch (error) {
      // Handle execution errors
      return this.createExecutionError(error);
    }
  }

  private buildSystemPrompt(
    userRequest: string,
    agenticSchema: Record<string, unknown>,
  ): string {
    const toolList = this.allToolNames
      .map((name) => {
        const tool = this.toolNameToDetailList.find(
          ([toolName]) => toolName === name,
        );
        const toolSchema = this.server.getInternalToolSchema(name);

        if (tool && tool[1]) {
          return `- ${name}: ${tool[1].description || `Tool: ${name}`}`;
        } else if (toolSchema) {
          return `- ${name}: ${toolSchema.description}`;
        }
        return `- ${name}`;
      })
      .join("\n");

    // Build the complete schema using forAgentic

    // Use compiled sampling prompt
    const basePrompt = CompiledPrompts.samplingExecution({
      toolName: this.name,
      description: this.description,
      toolList: toolList,
    });

    const taskPrompt = `

## Current Task
I will now use agentic sampling to complete the following task: "${userRequest}"

When I need to use a tool, I should specify the tool name in 'action' and provide tool-specific parameters as additional properties.
When the task is complete, I should use "action": "complete".`;

    // Use JSON instruction injection pattern
    return this.injectJsonInstruction({
      prompt: basePrompt + taskPrompt,
      schema: agenticSchema,
    });
  }
}
