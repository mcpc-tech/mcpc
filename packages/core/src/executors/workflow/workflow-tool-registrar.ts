import { jsonSchema } from "../../utils/schema.ts";
import type { RegisterWorkflowToolParams } from "../../types.ts";
import { WorkflowState } from "../../utils/state.ts";
import { createModelCompatibleJSONSchema } from "../../utils/common/provider.ts";
import { WorkflowExecutor } from "./workflow-executor.ts";
import type { ComposableMCPServer } from "../../compose.ts";
import { CompiledPrompts } from "../../prompts/index.ts";
import { createArgsDefFactory } from "../../factories/args-def-factory.ts";

export function registerAgenticWorkflowTool(
  server: ComposableMCPServer,
  {
    description,
    name,
    allToolNames,
    depGroups,
    toolNameToDetailList,
    predefinedSteps,
    ensureStepActions,
    toolNameToIdMapping,
  }: RegisterWorkflowToolParams,
) {
  const createArgsDef = createArgsDefFactory(
    name,
    allToolNames,
    depGroups,
    predefinedSteps,
    ensureStepActions,
  );

  // Create executor
  const workflowExecutor = new WorkflowExecutor(
    name,
    allToolNames,
    toolNameToDetailList,
    createArgsDef,
    server,
    predefinedSteps,
    ensureStepActions,
    toolNameToIdMapping,
  );

  const workflowState = new WorkflowState();

  const planningInstructions = predefinedSteps
    ? "- Set `init: true` (steps are predefined)"
    : "- Set `init: true` and define complete `steps` array";

  // Generate description
  const baseDescription = CompiledPrompts.workflowExecution({
    toolName: name,
    description: description,
    planningInstructions,
  });

  // Generate schema
  const argsDef = createArgsDef.forTool();

  const toolDescription = createArgsDef.forToolDescription(
    baseDescription,
    workflowState,
  );

  server.tool(
    name,
    toolDescription,
    jsonSchema<Record<string, unknown>>(
      createModelCompatibleJSONSchema(argsDef),
    ),
    async (args: Record<string, unknown>) => {
      try {
        return await workflowExecutor.execute(args, workflowState);
      } catch (error) {
        workflowState.reset();
        return {
          content: [
            {
              type: "text",
              text: `Workflow execution error: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
