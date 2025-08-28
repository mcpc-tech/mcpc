import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ajv } from "ajv";
import { AggregateAjvError } from "@segment/ajv-human-errors";
import addFormats from "ajv-formats";
import type { ComposableMCPServer } from "../../compose.ts";
import { CompiledPrompts } from "../../prompts/index.ts";

const ajv = new Ajv({
  allErrors: true,
  verbose: true,
});
// @ts-ignore -
addFormats(ajv);

export class AgenticExecutor {
  constructor(
    private name: string,
    private allToolNames: string[],
    private toolNameToDetailList: [string, unknown][],
    private server: ComposableMCPServer,
    private ACTION_KEY: string = "action",
    private NEXT_ACTION_KEY: string = "nextAction",
  ) {}

  async execute(
    args: Record<string, unknown>,
    schema: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const validationResult = this.validate(args, schema);
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

    const actionName = args[this.ACTION_KEY] as string;

    // First check external tools
    const currentTool = this.toolNameToDetailList.find(
      ([name, _detail]: [string, unknown]) => name === actionName,
    )?.[1] as
      | { execute: (args: unknown) => Promise<CallToolResult> }
      | undefined;

    if (currentTool) {
      // Execute external tool
      const nextAction = args[this.NEXT_ACTION_KEY] as string;
      const currentResult = await currentTool.execute({
        ...(args[actionName] as Record<string, unknown>),
      });

      if (args[nextAction]) {
        currentResult?.content?.unshift({
          type: "text",
          text: CompiledPrompts.actionSuccess({
            toolName: this.name,
            nextAction: nextAction,
            currentAction: actionName,
          }),
        });
      } else {
        currentResult?.content?.unshift({
          type: "text",
          text: CompiledPrompts.planningPrompt({
            currentAction: actionName,
          }),
        });
      }

      return currentResult;
    }

    // If not found in external tools, check internal tools
    if (this.allToolNames.includes(actionName)) {
      try {
        const result = await this.server.callTool(
          actionName,
          args[actionName] as Record<string, unknown>,
        );

        const nextAction = args[this.NEXT_ACTION_KEY] as string;
        const callToolResult = {
          content: [
            {
              type: "text" as const,
              text: typeof result === "string"
                ? result
                : JSON.stringify(result, null, 2),
            },
          ],
        };

        if (nextAction && this.allToolNames.includes(nextAction)) {
          callToolResult.content.unshift({
            type: "text",
            text: CompiledPrompts.actionSuccess({
              toolName: this.name,
              nextAction: nextAction,
              currentAction: actionName,
            }),
          });
        } else {
          callToolResult.content.unshift({
            type: "text",
            text: CompiledPrompts.planningPrompt({
              currentAction: actionName,
            }),
          });
        }
        return callToolResult;
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error executing internal tool ${actionName}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
          isError: true,
        };
      }
    }

    // Tool not found
    return {
      content: [
        {
          type: "text",
          text: CompiledPrompts.completionMessage(),
        },
      ],
    };
  }

  // Validate arguments using JSON schema
  validate(
    args: Record<string, unknown>,
    schema: Record<string, unknown>,
  ): {
    valid: boolean;
    error?: string;
  } {
    // Skip validation for complete decision
    if (args.decision === "complete") {
      return { valid: true };
    }
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
