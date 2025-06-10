import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
  Implementation,
} from "@modelcontextprotocol/sdk/types.js";
import { jsonSchema, Schema } from "ai";
import { McpSettingsSchema } from "./service/tools.ts";
import {
  Server,
  type ServerOptions,
} from "@modelcontextprotocol/sdk/server/index.js";
import { Ajv } from "ajv";
import { AggregateAjvError } from "@segment/ajv-human-errors";
import addFormats from "ajv-formats";
import z from "zod";
import { optionalObject } from "././utils/common/json.ts";
import { composeMcpDepTools, parseTags } from "../mod.ts";
import { ComposeDefination } from "./set-up-mcp-compose.ts";
import { pick } from "@es-toolkit/es-toolkit";
import { join } from "node:path";
import { MCPCStep, WorkflowState } from "./utils/state.ts";
import { createGoogleCompatibleJSONSchema } from "./utils/common/provider.ts";

const TOOLS_PLACEHOLDER = "__ALL__";

const NEXT_ACTION_KEY = "nextAction";
const ACTION_KEY = "action";

const ajv = new Ajv({
  allErrors: true,
  verbose: true,
});
// @ts-ignore -
addFormats(ajv);

/**
 * Helper type to extract variable names (inside {}) from a template string literal.
 * e.g., ExtractVariables<"Hello {name}! You are {age}."> -> "name" | "age"
 */
type ExtractVariables<S extends string> =
  S extends `${string}{${infer Var}}${infer Rest}`
    ? Var extends `${infer ActualVar}}` // Handle potential extra '}' if no Rest or adjacent braces
      ? ActualVar | ExtractVariables<Rest>
      : Var | ExtractVariables<Rest> // Standard case {var}
    : never;

/**
 * Type for the input object required by the formatting function.
 * Maps extracted variable names to allowed input types (string, number, boolean).
 */
type PromptInput<T extends string> = Record<
  ExtractVariables<T>,
  string | number | boolean
>;

export interface MCPCOptions {}

export class ComposableMCPServer extends Server {
  private tools: Tool[] = [];
  private nameToCb: Map<string, (args: any, extra?: any) => any> = new Map();

  constructor(_serverInfo: Implementation, options: ServerOptions) {
    super(_serverInfo, options);
  }

  tool<T>(
    name: string,
    description: string,
    paramsSchema: Schema<T>,
    cb: (args: T, extra?: any) => any
  ) {
    const tools: Tool[] = [
      ...this.tools,
      {
        name,
        description,
        inputSchema: paramsSchema.jsonSchema as any,
      },
    ];
    this.tools = tools;
    this.nameToCb.set(name, cb);

    this.setRequestHandler(ListToolsRequestSchema, () => {
      return { tools: this.tools };
    });

    this.setRequestHandler(CallToolRequestSchema, (request, extra) => {
      const { name: n, arguments: args } = request.params;
      return this.nameToCb.get(n)?.(args, extra);
    });
  }

  async compose(
    name: string,
    description: string,
    depsConfig: z.infer<typeof McpSettingsSchema>,
    options: ComposeDefination["options"] = { mode: "agentic_workflow" }
  ) {
    const { tagToResults, $ } = parseTags(description, ["tool", "fn"]);
    const tools = await composeMcpDepTools(
      depsConfig,
      ({ mcpName, toolNameWithScope, internalToolName, toolId }) => {
        return tagToResults.tool.find((tool) => {
          const selectAll =
            tool.attribs.name === `${mcpName}.${TOOLS_PLACEHOLDER}`;

          description = description.replace(
            $(tool).prop("outerHTML")!,
            `<action ${ACTION_KEY}="${toolId}"/>`
          );
          if (selectAll) {
            return true;
          }
          return tool.attribs.name === toolNameWithScope;
        });
      }
    );

    const toolNameToDetailList = Object.entries(tools);
    const allToolNames = toolNameToDetailList.map(([name]) => name);
    console.log(`[${name}][composed tools] ${Object.keys(tools)}`);
    const depGroups: any = toolNameToDetailList
      .flatMap(([toolName, tool]) => {
        if (!tool) {
          throw new Error(
            `Action ${toolName} not found, available action list: ${allToolNames.join(
              ", "
            )}`
          );
        }

        const baseSchema = tool.inputSchema || {
          type: "object",
          properties: {},
          required: [],
        };

        const baseProperties =
          baseSchema.type === "object" && baseSchema.properties
            ? baseSchema.properties
            : {};
        const baseRequired =
          baseSchema.type === "object" && baseSchema.required
            ? baseSchema.required
            : [];

        return {
          [toolName]: {
            type: "object",
            description: tool.description,
            properties: {
              ...baseProperties,
            },

            required: [...baseRequired],
            additionalProperties: false,
          },
        } as any;
      })
      .reduce((acc: any, cur: any) => ({ ...acc, ...cur }), {});

    switch (options.mode) {
      case "agentic":
        await this.registerTool({
          description,
          name,
          allToolNames,
          depGroups,
          toolNameToDetailList,
        });
        return;
      case "agentic_workflow":
        await this.registerAgenticWorkflowTool({
          description,
          name,
          allToolNames,
          depGroups,
          toolNameToDetailList,
        });
        return;
    }
  }

  async registerAgenticWorkflowTool({
    description,
    name,
    allToolNames,
    depGroups,
    toolNameToDetailList,
  }: any) {
    const createArgsDef = {
      common: (
        extra: { [n: string]: Schema<{}>["jsonSchema"] },
        includeRepeat: boolean
      ): Schema<{}>["jsonSchema"] => ({
        type: "object",
        description: `**Object structured according to the current or next tool's JSON Schema argument definition**`,
        properties: {
          ...(includeRepeat
            ? {
                repeat: {
                  type: "boolean",
                  title: "Continue to Next Step",
                  description:
                    "**Controls step execution flow. Set to true to repeat the current step**",
                  default: false,
                },
              }
            : {}),
          ...extra,
        },
        required: Object.keys(extra).filter((n) => n !== "steps"),
        additionalProperties: true,
      }),

      steps: (): Schema<{}>["jsonSchema"] => ({
        type: "array",
        title: "Steps Definition",
        description: `
An array of step objects that define a sequence of COMPLETE actions as part of a workflow to be executed to fulfill the user's request.

CRITICAL:
-   **Workflow as a Sequence of States**: Steps MUST be organized to reflect the workflow's logical sequence. Each step represents a distinct phase.
-   **Sequential Dependency Rule**: If Action B depends on the outcome of Action A, they MUST be in separate, sequential steps (A in Step N, B in Step N+1).
-   **Concurrent Action Rule**: All actions within a single step are considered independent and MUST be executable concurrently.
-   **Empty Organizational Steps**: Leave the actions array empty (\`[]\`) ONLY IF a step is purely for organizational purposes or planning, and no action usage is mentioned.
-   **Action Fidelity Rule**: The set of generated actions MUST be a complete and faithful one-to-one mapping of the operations requested in the user's description. Do not add unrequested actions or omit requested ones.

BEST PRACTICES:
-   **Atomicity**: A step should be as atomic as possible.
-   **Idempotency**: Actions should be designed to be idempotent for safe retries.
-   **Clarity over Brevity**: Prefer more, smaller, focused steps over fewer, complex ones.
`,
        items: {
          type: "object",
          title: "Step Object",
          description: `
          A single step containing actions that execute concurrently.
          All actions in this step run simultaneously with no guaranteed order.
        `,
          properties: {
            description: {
              type: "string",
              title: "Step Description",
              description:
                "A human-readable description of what this step accomplishes",
              examples: [
                "List files in the source directory",
                "Create necessary target directories",
                "Move files to their respective folders",
                "Validate input and initialize logging",
              ],
            },
            actions: {
              type: "array",
              title: "Concurrent Actions",
              description: `Array of action names that execute concurrently in this step.`,
              items: {
                type: "string",
                enum: allToolNames,
                description: "Individual action name from available actions",
              },
              uniqueItems: true,
              examples: [
                ["list_directory"],
                ["create_folder_a", "create_folder_b"],
                ["validate_input"],
              ],
            },
          },
          required: ["description", "actions"],
          additionalProperties: false,
        },
        minItems: 1,
        maxItems: 50,
      }),

      forCurrentState: (state: WorkflowState): Schema<{}>["jsonSchema"] => {
        if (!state.isWorkflowInitialized()) {
          return createArgsDef.common({ steps: createArgsDef.steps() }, false);
        }

        const currentStep = state.getCurrentStep();
        if (!currentStep) {
          throw new Error(`Invalid workflow state: no current step`);
        }

        const stepDependencies = pick(depGroups, currentStep.actions);
        const includeRepeat = state.hasNextStep();

        return createArgsDef.common(stepDependencies, includeRepeat);
      },

      forNextState: (state: WorkflowState): Schema<{}>["jsonSchema"] => {
        if (!state.isWorkflowInitialized() || !state.hasNextStep()) {
          throw new Error(
            `Cannot get next state schema: no next step available`
          );
        }

        // Get next step without modifying current state
        const currentStepIndex = state.getCurrentStepIndex();
        const allSteps = state.getSteps();
        const nextStep = allSteps[currentStepIndex + 1];

        if (!nextStep) {
          throw new Error(`Next step not found`);
        }

        const stepDependencies = pick(depGroups, nextStep.actions);
        const includeRepeat = currentStepIndex + 2 < allSteps.length;

        return createArgsDef.common(stepDependencies, includeRepeat);
      },
    };

    const executor = {
      async execute(args: any, state: WorkflowState): Promise<any> {
        // User intent detection - if steps are provided and workflow is already initialized, reset state
        if (args.steps && state.isWorkflowInitialized()) {
          state.reset();
        }

        // Determine which schema to use for validation based on user intent
        let validationSchema;

        if (!state.isWorkflowInitialized()) {
          // First call - expecting steps
          validationSchema = createArgsDef.forCurrentState(state);
        } else {
          // Subsequent calls - check user intent
          const shouldContinue = args.repeat === false;

          if (shouldContinue && state.hasNextStep()) {
            // User wants to continue to next step - validate against NEXT step's schema
            // Create a temporary state to get next step's schema
            validationSchema = createArgsDef.forNextState(state);
          } else {
            // User wants to repeat current step - validate against CURRENT step's schema
            validationSchema = createArgsDef.forCurrentState(state);
          }
        }

        // Parameter validation using the appropriate schema
        const validate = ajv.compile(validationSchema);
        if (!validate(args)) {
          const errors = new AggregateAjvError(validate.errors!);
          return {
            content: [
              {
                type: "text",
                text: `Tool call arguments validation failed: ${errors.message}`,
              },
            ],
            isError: true,
          };
        }

        // Route to specific method based on workflow state
        if (!state.isWorkflowInitialized()) {
          if (!args.steps) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: Workflow not initialized. Please provide 'steps' parameter to start a new workflow.",
                },
              ],
              isError: true,
            };
          }
          return await this.initialize(args, state);
        } else {
          // Pass shouldContinue to executeStep so it can decide when to move state
          return await this.executeStep(args, state);
        }
      },

      async initialize(args: any, state: WorkflowState): Promise<any> {
        const steps = args.steps as Array<MCPCStep>;

        if (!steps || steps.length === 0) {
          return {
            content: [{ type: "text", text: "Error: No steps provided" }],
            isError: true,
          };
        }

        state.initialize(steps);

        const firstStepArgsDef = createArgsDef.forCurrentState(state);

        return {
          content: [
            {
              type: "text",
              text: `Workflow initialized with ${steps.length} steps.

## Next Step's Tool Arguments JSON Schema Definition
${JSON.stringify(firstStepArgsDef, null, 2)}

## Next Step's Purpose
${state.getNextStep()?.description}
`,
            },
          ],
          isError: false,
        };
      },

      async executeStep(args: any, state: WorkflowState): Promise<any> {
        const currentStep = state.getCurrentStep();
        if (!currentStep) {
          return {
            content: [
              { type: "text", text: "Error: No current step to execute" },
            ],
            isError: true,
          };
        }

        const results = {
          content: [] as Array<{ type: string; text: string }>,
          isError: false,
        };

        // Execute all actions in the current step
        for (const action of currentStep.actions) {
          try {
            const currentTool = toolNameToDetailList.find(
              ([toolName]: [string]) => toolName === action
            )?.[1];

            if (!currentTool) {
              throw new Error(`Tool ${action} not found`);
            }

            const actionArgs = args[action] || {};
            const actionResult = await currentTool.execute(actionArgs);

            if (!results.isError) {
              results.isError = actionResult.isError;
            }

            results.content.push({
              type: "text",
              text: `Action ${action} result: ${JSON.stringify(
                actionResult,
                null,
                2
              )}`,
            });
          } catch (error) {
            results.content.push({
              type: "text",
              text: `Action ${action} failed: ${(error as any).message}`,
            });
            results.isError = true;
          }
        }

        const shouldContinue = args.repeat === false;

        if (state.hasNextStep()) {
          if (shouldContinue) {
            state.moveToNextStep();
          }
          // Get schema for the newly moved-to step
          const nextStepArgsDef = createArgsDef.forCurrentState(state);
          results.content.push({
            type: "text",
            text: `Based on the above action result, you **MUST** decide whether to proceed to the next step. 
If you choose to repeat, set "repeat" to true and provide current step's arguments.
If you choose to continue, provide the required arguments as follows:

# Next Step's Tool Arguments JSON Schema Definition
${JSON.stringify(nextStepArgsDef, null, 2)}
# Next Step's Purpose
${state.getNextStep()?.description}

**Instructions:**
- Analyze the previous action's result carefully
- Determine if the next step is necessary and appropriate
- If proceeding, ensure all required parameters are properly filled
- If not proceeding, set "repeat" to true and provide a clear reason`,
          });
        } else {
          // Workflow completed
          state.reset();
          results.content.push({
            type: "text",
            text: "**Workflow completed successfully**. All steps have been executed.",
          });
        }

        return results;
      },
    };

    const workflowState = new WorkflowState();

    const toolDescription = `You are an autonomous agent tool named \`${name}\` that fulfills user instructions through **iterative self-invocation (\`${name}\`)**.

**Core Operational Model**:
1.  **First Call (Planning)**: Receive the user's instruction and formulate a complete, detailed multi-step workflow.
2.  **Subsequent Calls (Execution)**: Each self-invocation executes only one specific step from the workflow.

**User Instructions**: ${description}

**Workflow Rules (MUST be followed)**:
- **On the first call**: Your response **MUST** include a JSON array named \`steps\`, which contains **all** the steps planned to fulfill the user's instructions.
- **On subsequent self-invocations**: You are executing a pre-planned step. Your response **MUST NOT** contain the \`steps\` key; just execute the instructions for the current step.
- **To restart or backtrack**: If you need to restart the entire workflow or begin execution again from an earlier stage of the workflow, you MUST re-declare the complete steps array in your response.

**Available Actions**: ${allToolNames.join(", ")}
`;

    this.tool(
      name,
      toolDescription,
      jsonSchema(
        createGoogleCompatibleJSONSchema(
          createArgsDef.forCurrentState(workflowState) as any
        )
      ),
      async (args: any) => {
        try {
          const currentArgsDef = createArgsDef.forCurrentState(workflowState);
          const validate = ajv.compile(currentArgsDef);
          if (!validate(args)) {
            const errors = new AggregateAjvError(validate.errors!);
            return {
              content: [
                {
                  type: "text",
                  text: `Tool call arguments validation failed: ${errors.message}`,
                },
              ],
              isError: true,
            };
          }

          if (!workflowState.isWorkflowInitialized()) {
            return await executor.initialize(args, workflowState);
          } else {
            return await executor.executeStep(args, workflowState);
          }
        } catch (error) {
          workflowState.reset();
          return {
            content: [
              {
                type: "text",
                text: `Workflow execution error: ${(error as any).message}`,
              },
            ],
            isError: true,
          };
        }
      }
    );
  }

  async registerTool({
    description,
    name,
    allToolNames,
    depGroups,
    toolNameToDetailList,
  }: any) {
    description = `Context: This is the autonomous MCP tool \`${name}\`. It fulfills user instructions by orchestrating actions via **iterative self-invocation(\`${name}\`)**.

# User Instructions: ${description}

# Action Execution Protocol

The MCP tool executes actions in a multi-step process. Follow these steps for each iteration:

* Do not treat actions merely as simple tool calls.
* Always execute actions via this protocol. Do NOT attempt direct, unstructured calls.

1.  **Determine Current Action:** Based on user instructions, overall task goal, and prior results, identify the *single most appropriate action* for this step.
2.  **Anticipate Next Action (if any):** Plan and anticipate the likely *next action* needed to complete the task after the current step.

# Available Actions

**WARNING:** ONLY call or execute actions from this list. DO NOT attempt to call or execute actions not explicitly listed here.
${allToolNames.join(", ")}
`;
    const allOf = toolNameToDetailList.map(([toolName]: [string]) => {
      return {
        if: {
          properties: { [ACTION_KEY]: { const: toolName } },
          required: [ACTION_KEY],
        },
        then: {
          required: [toolName],
        },
      };
    });

    const argsDef: Schema<{}>["jsonSchema"] = {
      additionalProperties: false,
      allOf,
      type: "object",
      properties: {
        [ACTION_KEY]: {
          type: "string",
          enum: allToolNames,
          description:
            "Specifies the action to be performed from the enum. Based on the value chosen for 'action', the corresponding sibling property (which shares the same name as the action value and contains its specific parameters) **MUST** also be provided in this object. For example, if 'action' is 'get_weather', then the 'get_weather' parameter object is mandatory.",
        },
        [NEXT_ACTION_KEY]: {
          type: "string",
          enum: allToolNames,
          description:
            "Specify the next action to execute only when the user’s request requires additional steps. If no next action is needed, this property **MUST BE OMITTED** from the object.",
        },
        ...depGroups,
      },
      required: [ACTION_KEY],
    };

    const validate = ajv.compile(argsDef);

    this.tool(
      name,
      description,
      jsonSchema<any>(createGoogleCompatibleJSONSchema(argsDef as any)),
      async (args) => {
        if (!validate(args)) {
          const errors = new AggregateAjvError(validate.errors!);
          return {
            content: [
              {
                type: "text",
                text: `Tool/Function argument validation failed: ${errors.message}`,
              },
            ],
            isError: true,
          };
        }

        const currentTool = toolNameToDetailList.find(
          ([name]: [string]) => name === args[ACTION_KEY]
        )?.[1];

        const action = args[ACTION_KEY] as string;
        const nextAction = args[NEXT_ACTION_KEY] as string;
        const currentResult = await currentTool.execute({
          ...args[action],
        });

        if (args[nextAction]) {
          currentResult?.content?.unshift({
            type: "text",
            text: `# You WILL call this tool(\`${name}\`) AGAIN using the \`${nextAction}\` action, after evaluating the result from previous action(${action}):`,
          });
        } else {
          currentResult?.content?.unshift({
            type: "text",
            text: `# You WILL plan next action if the user request needs additional actions to be fulfilled, after evaluating the result from previous action(${action}):`,
          });
        }

        return currentResult;
      }
    );
  }
}

/**
 * Registers all tools from the composed MCP dependencies with a server.
 */
export function registerDepTools(
  server: ComposableMCPServer,
  tools: Record<string, any>
): ComposableMCPServer {
  Object.entries(tools).forEach(([name, tool]) => {
    // Register the tool with the server
    server.tool(
      name,
      tool.description ?? "",
      tool.parameters.jsonSchema,
      tool.execute
    );
  });

  return server as ComposableMCPServer;
}
