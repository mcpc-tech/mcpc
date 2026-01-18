import { jsonSchema, type Schema } from "../../utils/schema.ts";
import type { RegisterToolParams } from "../../types.ts";
import { createModelCompatibleJSONSchema } from "../../utils/common/provider.ts";
import type { ComposableMCPServer } from "../../compose.ts";
import { CompiledPrompts } from "../../prompts/index.ts";
import { AgenticExecutor } from "./agentic-executor.ts";
import { createArgsDefFactory } from "../../factories/args-def-factory.ts";

/**
 * Register an agentic tool using simplified Unix-style interface
 *
 * Schema design:
 * - `tool`: which tool to execute (or "man" to get schemas)
 * - `args`: parameters for the tool
 */
export function registerAgenticTool(
  server: ComposableMCPServer,
  {
    description,
    name,
    allToolNames,
    depGroups,
    toolNameToDetailList,
  }: RegisterToolParams,
) {
  const createArgsDef = createArgsDefFactory(
    name,
    allToolNames,
    depGroups,
    undefined,
    undefined,
  );

  // Create executor
  const agenticExecutor = new AgenticExecutor(
    name,
    allToolNames,
    toolNameToDetailList,
    server,
  );

  // Use simplified prompt
  description = CompiledPrompts.autonomousExecution({
    toolName: name,
    description,
  });

  // Use simplified schema with `tool` + `args`
  const agenticArgsDef = createArgsDef.forAgentic(allToolNames);
  const argsDef: Schema<Record<PropertyKey, never>>["jsonSchema"] =
    agenticArgsDef;
  const schema = allToolNames.length > 0
    ? argsDef
    : { type: "object", properties: {} };

  server.tool(
    name,
    description,
    jsonSchema<Record<string, unknown>>(
      createModelCompatibleJSONSchema(schema as Record<string, unknown>),
    ),
    async (args: Record<string, unknown>) => {
      return await agenticExecutor.execute(
        args,
        schema as Record<string, unknown>,
      );
    },
  );
}
