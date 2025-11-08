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
  // Both parameters can be used together for maximum efficiency
  const schema: Schema<{
    code?: string;
    definitionsOf?: string[];
    hasDefinitions?: string[];
  }>["jsonSchema"] = {
    type: "object",
    properties: {
      code: {
        type: "string",
        description:
          "JavaScript to run. You can use callMCPTool(toolName, params) and console.log(). Before calling a tool, request its schema with definitionsOf, then use it in your code.",
      },
      definitionsOf: {
        type: "array",
        items: allToolNames.length > 0
          ? { type: "string", enum: allToolNames }
          : { type: "string" },
        default: [],
        description:
          `Tool names whose schemas you need. The agent uses these to understand available tools before calling them.`,
      },
      hasDefinitions: {
        type: "array",
        items: allToolNames.length > 0
          ? { type: "string", enum: allToolNames }
          : { type: "string" },
        description:
          `Tool names whose schemas were already provided in this conversation. List all tools you have schemas for to avoid duplicate schema requests`,
      },
    },
  };

  server.tool(
    name,
    description,
    jsonSchema<Record<string, unknown>>(
      createGoogleCompatibleJSONSchema(schema as Record<string, unknown>),
    ),
    async (args: Record<string, unknown>) => {
      return await executor.execute(args, {
        ...schema,
        // Use if-then to enforce: if code exists, hasDefinitions must be non-empty
        if: {
          properties: { code: { type: "string" } },
          required: ["code"],
        },
        then: {
          properties: {
            hasDefinitions: {
              type: "array",
            },
          },
          required: ["hasDefinitions"],
        },
        // At least one of code or definitionsOf must be provided
        anyOf: [
          { required: ["code"] },
          {
            properties: {
              definitionsOf: { type: "array", minItems: 1 },
            },
            required: ["definitionsOf"],
          },
        ],
      } as Record<string, unknown>);
    },
  );
}
