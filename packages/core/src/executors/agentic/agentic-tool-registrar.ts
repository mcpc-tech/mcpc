import { jsonSchema } from "../../utils/schema.ts";
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
    manual,
  }: RegisterToolParams,
) {
  const createArgsDef = createArgsDefFactory(
    name,
    allToolNames,
    depGroups,
    undefined,
    undefined,
  );

  // Create executor (pass manual for `man { manual: true }`)
  const agenticExecutor = new AgenticExecutor(
    name,
    allToolNames,
    toolNameToDetailList,
    server,
    manual,
  );

  // Use compact prompt if manual is provided, otherwise full prompt
  description = manual
    ? CompiledPrompts.autonomousExecutionCompact({
      toolName: name,
      description,
    })
    : CompiledPrompts.autonomousExecution({
      toolName: name,
      description,
    });

  // Use simplified schema with `tool` + `args`
  // Always include schema even if no tools (man command is always available)
  const agenticArgsDef = createArgsDef.forAgentic(allToolNames);
  const schema = agenticArgsDef;

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
