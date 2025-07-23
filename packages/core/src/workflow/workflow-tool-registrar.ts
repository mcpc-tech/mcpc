import { jsonSchema } from "ai";
import type { RegisterWorkflowToolParams } from "../types.ts";
import { WorkflowState } from "../utils/state.ts";
import { createGoogleCompatibleJSONSchema } from "../utils/common/provider.ts";
import { WorkflowExecutor } from "./workflow-executor.ts";
import { createArgsDefFactory } from "./args-def-factory.ts";
import type { ComposableMCPServer } from "../compose.ts";

export function registerAgenticWorkflowTool(
  server: ComposableMCPServer,
  {
    description,
    name,
    allToolNames,
    depGroups,
    toolNameToDetailList,
    predefinedSteps,
  }: RegisterWorkflowToolParams
) {
  const createArgsDef = createArgsDefFactory(name, allToolNames, depGroups, predefinedSteps);
  const executor = new WorkflowExecutor(name, allToolNames, toolNameToDetailList, createArgsDef, server, predefinedSteps);
  const workflowState = new WorkflowState();

  const toolDescription = `Autonomous workflow execution tool \`${name}\` that processes user requests through structured multi-step workflows.

<instructions>${description}</instructions>

## Workflow Execution Protocol

**🎯 FIRST CALL (Planning):**
${predefinedSteps ? '- Set \`init: true\` (steps are predefined)' : '- Set \`init: true\` and define complete \`steps\` array'}

**⚡ SUBSEQUENT CALLS (Execution):**
- Provide ONLY current step parameters
- **ADVANCE STEP**: Set \`proceed: true\` to move to next step  
- **RETRY STEP**: Set \`proceed: false\` (or omit) to retry current step
- Use \`reasoning\` action for thinking/analysis

**🚫 Do NOT include \`steps\` parameter during normal execution**
**✅ Include \`steps\` parameter ONLY when restarting workflow with \`init: true\`**
**⚠️ CRITICAL: When retrying failed steps, NEVER use \`proceed: true\`**`;

  server.tool(
    name,
    createArgsDef.forToolDescription(toolDescription, workflowState),
    jsonSchema<Record<string, unknown>>(
      createGoogleCompatibleJSONSchema(createArgsDef.forTool())
    ),
    async (args: Record<string, unknown>) => {
      try {
        return await executor.execute(args, workflowState);
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
    }
  );
}
