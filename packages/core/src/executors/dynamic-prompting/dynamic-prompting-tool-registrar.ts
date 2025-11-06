/**
 * Dynamic Prompting Tool Registrar
 *
 * Registers an agent tool that uses the dynamic prompting execution model:
 * 1. First, user/LLM selects which action/tool to use
 * 2. Then, agent prompts for specific parameters needed for that tool
 */

import { jsonSchema, type Schema } from "../../utils/schema.ts";
import type { RegisterToolParams } from "../../types.ts";
import { createGoogleCompatibleJSONSchema } from "../../utils/common/provider.ts";
import type { ComposableMCPServer } from "../../compose.ts";
import { CompiledPrompts } from "../../prompts/index.ts";
import { DynamicPromptingExecutor } from "./dynamic-prompting-executor.ts";

export function registerDynamicPromptingTool(
  server: ComposableMCPServer,
  {
    description,
    name,
    allToolNames,
    toolNameToDetailList,
  }: RegisterToolParams,
) {
  // Create executor
  const executor = new DynamicPromptingExecutor(
    name,
    allToolNames,
    toolNameToDetailList,
    server,
  );

  // Enhance description with dynamic prompting instructions
  description = CompiledPrompts.autonomousExecution({
    toolName: name,
    description:
      `${description}\n\n**Dynamic Prompting Mode - IMPORTANT**\nThis agent REQUIRES a two-stage interaction:\n1. **FIRST**: You MUST call this tool with an 'action' parameter to select which tool to use\n2. **SECOND**: After seeing the action's schema, call again with both 'action' and 'parameters'\n\n⚠️ DO NOT guess parameters without first selecting an action!\n⚠️ The 'action' field is REQUIRED - you cannot proceed without it.`,
  });

  // Create schema for the two-stage model
  const argsDef: Schema<Record<PropertyKey, never>>["jsonSchema"] = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: allToolNames,
        description:
          "REQUIRED: The action/tool to execute. You MUST select an action first. Do NOT guess parameters without selecting an action.",
      },
      parameters: {
        type: "object",
        description:
          "The parameters for the selected action. Provide after action selection.",
        additionalProperties: true,
      },
    },
    required: ["action"],
  };

  const schema = allToolNames.length > 0
    ? argsDef
    : { type: "object", properties: {} };

  server.tool(
    name,
    description,
    jsonSchema<Record<string, unknown>>(
      createGoogleCompatibleJSONSchema(schema as Record<string, unknown>),
    ),
    async (args: Record<string, unknown>) => {
      return await executor.execute(
        args,
        schema as Record<string, unknown>,
      );
    },
  );
}
