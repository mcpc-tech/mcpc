import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
  Implementation,
  CallToolResult,
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
import { composeMcpDepTools, parseTags } from "../mod.ts";
import { ComposeDefination } from "./set-up-mcp-compose.ts";
import { pick } from "@es-toolkit/es-toolkit";
import { MCPCStep, WorkflowState } from "./utils/state.ts";
import { createGoogleCompatibleJSONSchema } from "./utils/common/provider.ts";
import { updateRefPaths } from "./utils/common/schema.ts";

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
    depsConfig: z.infer<typeof McpSettingsSchema> = { mcpServers: {} },
    options: ComposeDefination["options"] = { mode: "agentic" }
  ) {
    const { tagToResults, $ } = parseTags(description, ["tool", "fn"]);

    // Filter tools and transform scoped tool names to valid action identifierss
    const tools = await composeMcpDepTools(
      depsConfig,
      ({ mcpName, toolNameWithScope, toolId }) => {
        const matchingStep = options.steps?.find((step) =>
          step.actions.includes(toolNameWithScope)
        );

        if (matchingStep) {
          const actionIndex = matchingStep.actions.indexOf(toolNameWithScope);
          if (actionIndex !== -1) {
            matchingStep.actions[actionIndex] = toolId;
          }
          return true;
        }

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

        const updatedProperties = updateRefPaths(baseProperties, toolName);

        return {
          [toolName]: {
            type: "object",
            description: tool.description,
            properties: updatedProperties,

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
          predefinedSteps: options.steps,
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
    predefinedSteps,
  }: any) {
    const hasDepTools = allToolNames.length > 0;
    const createArgsDef = {
      common: (extra: {
        [n: string]: Schema<{}>["jsonSchema"];
      }): Schema<{}>["jsonSchema"] => ({
        type: "object",
        description: `**Tool arguments structured according to the step's JSON Schema definition; it's DYNAMIC and will update for each step**`,
        properties: {
          ...extra,
        },
        required: Object.keys(extra),
      }),

      steps: (): Schema<{}>["jsonSchema"] => ({
        type: "array",
        description: `
An array of step objects that defines the complete sequence of actions for a workflow. This array should be provided only on the initial call, unless a workflow restart is required.

CRITICAL:
-   **Workflow as a Sequence of States**: Steps MUST be organized to reflect the workflow's logical sequence. Each step represents a distinct phase.
-   **Sequential Dependency Rule**: If Action B depends on the outcome of Action A, they MUST be in separate, sequential steps (A in Step N, B in Step N+1).
-   **Concurrent Action Rule**: All actions within a single step are considered independent and MUST be executable concurrently.
-   **Action Fidelity Rule**: The set of generated actions MUST be a complete and faithful one-to-one mapping of the operations requested in the user's description. Do NOT omit requested ones.
-   **Predefined steps**: MUST remain unspecified if predefined steps are present

BEST PRACTICES:
-   **Atomicity**: A step should be as atomic as possible.
-   **Idempotency**: Actions should be designed to be idempotent for safe retries.
-   **Clarity over Brevity**: Prefer more, smaller, focused steps over fewer, complex ones.`,
        items: {
          type: "object",
          description: `A single step containing actions that execute concurrently. All actions in this step run simultaneously with no guaranteed order.
        `,
          properties: {
            description: {
              type: "string",
              description: `**Describes what a step does, what it needs from previous steps or context, and what it outputs.**`,
            },
            actions: {
              type: "array",
              description: `Array of action names that execute concurrently in this step.`,
              items: {
                ...{
                  enum: allToolNames,
                },
                type: "string",
                // TODO: Does the model need to know tool arguments to fully understand the purpose?
                description: `Individual action name from available actions`,
              },
              uniqueItems: true,
              minItems: 0,
              // TODO: remove this restriction when workflow planning is good enough
              maxItems: 1,
              examples: [["reasoning"]],
            },
          },
          required: ["description", "actions"],
          additionalProperties: false,
        },
        default: predefinedSteps ? predefinedSteps : undefined,
        minItems: 1,
      }),

      init: (): Schema<{}>["jsonSchema"] => ({
        type: "boolean",
        description: `Init a new workflow`,
        enum: [true],
      }),

      proceed: (): Schema<{}>["jsonSchema"] => ({
        type: "boolean",
        description:
          "**Controls step execution flow. MUST be set to `true` to advance to the next step. If omitted or false, this step will be re-executed with the provided arguments**",
      }),

      forTool: (): Schema<{}>["jsonSchema"] => {
        return createArgsDef.common({});
      },

      forCurrentState: (state: WorkflowState): Schema<{}>["jsonSchema"] => {
        if (!state.isWorkflowInitialized()) {
          if (predefinedSteps) {
            return createArgsDef.common({ init: createArgsDef.init() });
          }
          return createArgsDef.common({
            steps: createArgsDef.steps(),
            init: createArgsDef.init(),
          });
        }

        const currentStep = state.getCurrentStep();
        if (!currentStep) {
          throw new Error(
            `Invalid workflow state: no current step, ${JSON.stringify(
              state.getDebugInfo()
            )}`
          );
        }

        const stepDependencies = {
          ...pick(depGroups, currentStep.actions),
        };

        stepDependencies["proceed"] = createArgsDef.proceed();

        return createArgsDef.common(stepDependencies);
      },

      forNextState: (state: WorkflowState): Schema<{}>["jsonSchema"] => {
        if (!state.isWorkflowInitialized() || !state.hasNextStep()) {
          throw new Error(
            `Cannot get next state schema: no next step available`
          );
        }

        const currentStepIndex = state.getCurrentStepIndex();
        const allSteps = state.getSteps();
        const nextStep = allSteps[currentStepIndex + 1];

        if (!nextStep) {
          throw new Error(`Next step not found`);
        }

        const stepDependencies = {
          ...pick(depGroups, nextStep.actions),
        };

        stepDependencies["proceed"] = createArgsDef.proceed();

        return createArgsDef.common(stepDependencies);
      },

      forToolDescription: (description: string, state: WorkflowState) => {
        const enforceToolArgs = createArgsDef.forCurrentState(state);
        const title = predefinedSteps
          ? `**YOU MUST execute this tool with following tool arguments to init the workflow**
NOTE: The \`steps\` has been predefined`
          : `**You MUST execute this tool with following tool arguments to plan and init the workflow**`;

        return `${description}
${title}
${JSON.stringify(enforceToolArgs, null, 2)}`;
      },

      forInitialStepDescription: (steps: MCPCStep[], state: WorkflowState) =>
        `Workflow initialized with ${
          steps.length
        } steps. You MUST start the workflow with the first step to \`${
          state.getCurrentStep()?.description
        }\`. 
              
## EXECUTE tool \`${name}\` with following new tool arguments

${JSON.stringify(createArgsDef.forCurrentState(state))}

## Important Instructions
- **Do NOT include 'steps' parameter in any subsequent tool calls**
- **MUST Use the provided JSON schema definition above for parameter generation and validation**
` +
        (predefinedSteps
          ? `## Workflow Steps\n${JSON.stringify(steps, null, 2)}`
          : ""),
    };

    const executor = {
      async execute(args: any, state: WorkflowState): Promise<any> {
        if (args.init) {
          state.reset();
        } else {
          if (!state.isWorkflowInitialized() && !args.init) {
            return {
              content: [
                {
                  type: "text",
                  text: predefinedSteps
                    ? "Error: Workflow not initialized. Please provide 'init' parameter to start a new workflow."
                    : `"Error: Workflow not initialized. Please provide 'init' and 'steps' parameter to start a new workflow."`,
                },
              ],
              isError: true,
            };
          }

          if (args.proceed === true) {
            if (!state.hasNextStep() && !state.isAtLastStep()) {
              return {
                content: [
                  {
                    type: "text",
                    text: "Error: Cannot proceed, you are already at the final step.",
                  },
                ],
                isError: true,
              };
            }
            if (state.isWorkflowStarted()) {
              state.moveToNextStep();
            } else {
              state.start();
            }
          }
        }

        const validationSchema = createArgsDef.forCurrentState(state);
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

        if (args.init) {
          return await this.initialize(args, state);
        }

        return await this.executeStep(args, state);
      },

      async initialize(args: any, state: WorkflowState): Promise<any> {
        const steps = (predefinedSteps ?? args.steps) as Array<MCPCStep>;

        if (!steps || steps.length === 0) {
          return {
            content: [{ type: "text", text: "Error: No steps provided" }],
            isError: true,
          };
        }

        state.initialize(steps);

        // The initial next step is the first one of the steps.
        return {
          content: [
            {
              type: "text",
              text: createArgsDef.forInitialStepDescription(
                predefinedSteps ?? args.steps,
                state
              ),
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

        const results: CallToolResult = {
          content: [],
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
              text: `Action \`${action}\` excuted with result: `,
            });
            results.content.push({
              type: "text",
              text: `${JSON.stringify(actionResult, null, 2)}`,
            });
          } catch (error) {
            results.content.push({
              type: "text",
              text: `Action \`${action}\` failed with error: `,
            });
            results.content.push({
              type: "text",
              text: `${(error as any).message}`,
            });
            results.isError = true;
          }
        }

        if (state.hasNextStep()) {
          const nextStepArgsDef = createArgsDef.forNextState(state);
          results.content.push({
            type: "text",
            text: `You **MUST** decide whether to proceed to the next step to \`${
              state.getNextStep()?.description
            }\`.
To retry, **You MUST EXECUTE tool \`${name}\` with current step's arguments
To proceed, You MUST EXECUTE tool \`${name}\` with the following tool arguments, ensuring the proceed parameter is set to true:

${JSON.stringify(nextStepArgsDef, null, 2)}

**Instructions:**
- Analyze the previous action's result carefully
- Determine if the next step is necessary and appropriate
- **Exclude the \`steps\` key from your generated parameters**`,
          });
        } else {
          results.content.push({
            type: "text",
            text: `Workflow completed. All steps have been executed.

The result of the final step is shown above. Based on this result, please choose your next action from the options below:

1.  **✅ Conclude and Finish:** If the result meets all expectations, provide the final answer or summary to the user directly. **Do not call this tool again.**

2.  **🔄 Retry the Final Step:** If the result of the final step is unsatisfactory or incorrect, you **CAN retry it** by calling this tool again with the required arguments for this last step.

3.  **🆕 Start a New Workflow:** If you need to start a brand new task from scratch, you **MUST** call this tool to initialize a new workflow`,
          });
        }

        return results;
      },
    };

    const workflowState = new WorkflowState();

    const toolDescription = `This is the autonomous agent \`${name}\` that fulfills user requests through a structured multi-step workflow. You MUST follow the instructions below to execute the workflow.

<instructions>${description}</instructions>

**WORKFLOW PHASES:**

**Phase 1 - PLANNING (First Call Only):**
- **If predefined steps exist, do NOT specify \`steps\`**
- Analyze user request and instructions.
- Generate complete workflow with ALL steps.
- Set \`init\` to true.

**Phase 2 - EXECUTION (All Subsequent Calls):**
- **CRITICAL: NEVER include 'steps' field in response.**
- **ONLY provide current step execution parameters.**
- **MUST use \`reasoning\` action when thinking, planning, or capturing an observation is needed.**`;

    this.tool(
      name,
      createArgsDef.forToolDescription(toolDescription, workflowState),
      jsonSchema(
        createGoogleCompatibleJSONSchema(createArgsDef.forTool() as any)
      ),
      async (args: any) => {
        try {
          return await executor.execute(args, workflowState);
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
    description = `This is the autonomous MCP agent \`${name}\`. It fulfills user instructions by orchestrating actions via **iterative self-invocation(\`${name}\`)**. You MUST follow the instructions below to execute the workflow.

<instructions>${description}</instructions>

# Action Execution Protocol

This tool executes actions in a multi-step process. Follow these steps for each iteration:
1.  **Determine Current Action:** Based on user instructions, overall task goal, and prior results, identify the *single most appropriate action* for this step.
2.  **Anticipate Next Action (if any):** Plan and anticipate the likely *next action* needed to complete the task after the current step.

* Do not treat actions merely as simple tool calls.
* Always execute actions via this protocol. Do NOT attempt direct, unstructured calls.`;

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
    const schema =
      allToolNames.length > 0 ? argsDef : { type: "object", properties: {} };
    const validate = ajv.compile(schema);

    this.tool(
      name,
      description,
      jsonSchema<any>(createGoogleCompatibleJSONSchema(schema as any)),
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

        if (!currentTool) {
          return {
            content: [
              {
                type: "text",
                text: `Compeleted, no dependent tools to execute`,
              },
            ],
          };
        }

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
