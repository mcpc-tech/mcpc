import { jsonSchema, type Schema } from "ai";
import type { RegisterWorkflowToolParams } from "../types.ts";
import { WorkflowState } from "../utils/state.ts";
import { createGoogleCompatibleJSONSchema } from "../utils/common/provider.ts";
import { WorkflowExecutor } from "./workflow-executor.ts";
import { createArgsDefFactory } from "./args-def-factory.ts";

interface MCPServer {
  tool: <T>(name: string, description: string, schema: Schema<T>, callback: (args: T) => unknown) => void;
}

export function registerAgenticWorkflowTool(
  server: MCPServer,
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
  const executor = new WorkflowExecutor(name, allToolNames, toolNameToDetailList, createArgsDef, predefinedSteps);
  const workflowState = new WorkflowState();

  const toolDescription = `This is the autonomous agent \`${name}\` that fulfills user requests through a structured multi-step workflow. You MUST follow the instructions below to execute the workflow.

<instructions>${description}</instructions>

**WORKFLOW PHASES:**

**Phase 1 - PLANNING (First Call Only):**
- **If predefined steps exist, do NOT specify \`steps\`**
- **Call this tool with \`init\` set to true**
- **Generate complete workflow with ALL steps**

**Phase 2 - EXECUTION (All Subsequent Calls):**
- **CRITICAL: NEVER include 'steps' field in response.**
- **ONLY provide current step execution parameters.**
- **MUST use \`reasoning\` action when thinking, planning, or capturing an observation is needed.**`;

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
