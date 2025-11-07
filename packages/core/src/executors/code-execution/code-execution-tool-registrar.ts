/**
 * Code Execution Tool Registrar
 *
 * Registers the code execution agent tool that implements progressive disclosure
 * and efficient context usage patterns from Anthropic's MCP guidelines.
 */

import { jsonSchema, type Schema } from "../../utils/schema.ts";
import type { RegisterToolParams } from "../../types.ts";
import { createGoogleCompatibleJSONSchema } from "../../utils/common/provider.ts";
import type { ComposableMCPServer } from "../../compose.ts";
import { CompiledPrompts } from "../../prompts/index.ts";
import { CodeExecutionExecutor } from "./code-execution-executor.ts";

export interface CodeExecutionRegisterParams extends RegisterToolParams {
  publicToolNames: string[];
  hiddenToolNames: string[];
}

export function registerCodeExecutionTool(
  server: ComposableMCPServer,
  {
    description,
    name,
    allToolNames,
    toolNameToDetailList,
    publicToolNames,
    hiddenToolNames,
  }: CodeExecutionRegisterParams,
) {
  // Create executor
  const executor = new CodeExecutionExecutor(
    name,
    allToolNames,
    toolNameToDetailList,
    server,
    publicToolNames,
    hiddenToolNames,
  );

  // Enhance description with code execution prompt
  description = CompiledPrompts.codeExecution({
    toolName: name,
    description,
  });

  // Schema for code execution mode
  const schema: Schema<{
    action: string;
    keyword?: string;
    code?: string;
    decision: string;
    [key: string]: unknown;
  }>["jsonSchema"] = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["search_tools", "execute_code"],
        description:
          "Action: 'search_tools' to discover tools, 'execute_code' to run JavaScript",
      },
      keyword: {
        type: "string",
        description:
          "Search keyword for tools (empty = all tools). Used with 'search_tools' action.",
      },
      code: {
        type: "string",
        description:
          "JavaScript code to execute. Used with 'execute_code' action.",
      },
      decision: {
        type: "string",
        enum: ["proceed", "complete"],
        description: "proceed = continue execution, complete = task finished",
      },
    },
    required: ["action", "decision"],
  };

  server.tool(
    name,
    description,
    jsonSchema<Record<string, unknown>>(
      createGoogleCompatibleJSONSchema(schema as Record<string, unknown>),
    ),
    async (args: Record<string, unknown>) => {
      return await executor.execute(args, schema as Record<string, unknown>);
    },
  );
}
