import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
  Implementation,
} from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { generateId, jsonSchema, Schema } from "ai";
import { McpSettingsSchema, ServerConfigSchema } from "../../service/tools.ts";
import {
  Server,
  type ServerOptions,
} from "@modelcontextprotocol/sdk/server/index.js";
import { Ajv } from "ajv";
import { AggregateAjvError } from "@segment/ajv-human-errors";
import addFormats from "ajv-formats";
import z from "zod";

import { CheerioAPI, load } from "cheerio";
import { smitheryToolNameCompatibale } from "./registory.ts";

const TOOLS_PLACEHOLDER = "__ALL__";

const NEXT_ACTION_KEY = "nextAction";
const ACTION_KEY = "action";
const MCPC_ARGS_KEY = "mcpcArgs";

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

/**
 * Options for the native prompt function (optional).
 */
interface NativePromptOptions {
  /**
   * Defines how to handle missing variables in the input object during formatting.
   * - 'error': Throw an error.
   * - 'warn': Print a warning to the console and leave the placeholder unchanged.
   * - 'ignore': Leave the placeholder unchanged silently.
   * - 'empty': Replace the placeholder with an empty string.
   * @default 'warn'
   */
  missingVariableHandling?: "error" | "warn" | "ignore" | "empty";
}

export class ComposableMCPServer extends Server {
  private tools: Tool[] = [];
  private nameToCb: Map<string, (args: any, extra?: any) => any> = new Map();

  constructor(_serverInfo: Implementation, options?: ServerOptions) {
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
      // TODO: args type checking
      const { name: n, arguments: args } = request.params;
      return this.nameToCb.get(n)?.(args, extra);
    });
  }

  async compose(
    name: string,
    description: string,
    depsConfig: z.infer<typeof McpSettingsSchema>
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
            // additionalProperties: false,
          },
        } as any;
      })
      .reduce((acc: any, cur: any) => ({ ...acc, ...cur }), {});

    const allOf = toolNameToDetailList.map(([toolName]) => {
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
      // Provider restriction: did not support additionalProperties
      // see -> https://ai.google.dev/api/caching#Schema
      // additionalProperties: false,
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
      // Provider restriction: tools.0.custom.input_schema: input_schema does not support oneOf, allOf, or anyOf at the top level"
      //
      // allOf,
    };

    const validate = ajv.compile(argsDef);

    this.tool(name, description, jsonSchema<any>(argsDef), async (args) => {
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
        ([name]) => name === args[ACTION_KEY]
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
    });
  }
}

/**
 * Creates a formatting function from a template string with type-safe input variables
 * (when the template is provided as a string literal).
 */
export const p = <T extends string>(
  template: T,
  options: NativePromptOptions = {}
): ((input: PromptInput<T>) => string) => {
  const { missingVariableHandling = "warn" } = options;

  // Pre-compute variable names (at runtime) for the formatting function closure
  // Note: Type safety comes from PromptInput<T> derived from the *literal* type T
  const variableNames = new Set<string>();
  const regex = /\{((\w|\.)+)\}/g; // Simple regex for {alphanumeric_variable}
  let match;
  while ((match = regex.exec(template)) !== null) {
    variableNames.add(match[1]);
  }
  const requiredVariables = Array.from(
    variableNames
  ) as (keyof PromptInput<T>)[]; // Runtime list

  // Return the formatting function
  return (input: PromptInput<T>): string => {
    let result = template as string;

    for (const variableName of requiredVariables) {
      const key = variableName as keyof typeof input; // Cast for lookup
      const value = input[key];

      if (value !== undefined && value !== null) {
        // Replace *all* occurrences of this specific variable placeholder
        const replaceRegex = new RegExp(`\\{${String(variableName)}\\}`, "g");
        result = result.replace(replaceRegex, String(value));
      } else {
        // Handle missing variable based on options
        const placeholder = `{${String(variableName)}}`;
        switch (missingVariableHandling) {
          case "error": {
            throw new Error(
              `Missing variable "${String(
                variableName
              )}" in input for template.`
            );
          }
          case "warn": {
            // console.warn(
            //   `Warning: Variable "${
            //     String(
            //       variableName,
            //     )
            //   }" missing in input. Placeholder "${placeholder}" left unchanged.`,
            // );
            break;
          }
          case "empty": {
            const replaceRegex = new RegExp(
              `\\{${String(variableName)}\\}`,
              "g"
            );
            result = result.replace(replaceRegex, "");
            break;
          }
          case "ignore": {
            // Do nothing, leave placeholder
            break;
          }
        }
      }
    }

    return result;
  };
};
export function parseTags(
  htmlString: string,
  tags: Array<string>
): { tagToResults: Record<string, any[]>; $: CheerioAPI } {
  const $ = load(htmlString, { xml: { decodeEntities: false } });

  const tagToResults: Record<string, any[]> = {};
  for (const tag of tags) {
    const elements = $(tag);
    tagToResults[tag] = elements.toArray();
  }
  return { tagToResults, $ };
}

/**
 * Compose all the tools from all the MCP servers.
 */
export async function composeMcpDepTools(
  mcpConfig: z.infer<typeof McpSettingsSchema>,
  filterIn?: (params: {
    action: string;
    tool: any;
    mcpName: string;
    toolNameWithScope: string;
    internalToolName: string;
    toolId: string;
  }) => boolean
): Promise<Record<string, any>> {
  const allTools: Record<string, any> = {};

  // Process each MCP definition sequentially
  for (const [name, defination] of Object.entries(mcpConfig.mcpServers)) {
    const def = defination as z.infer<typeof ServerConfigSchema>;

    if (def.disabled) {
      continue;
    }

    let transport:
      | StdioClientTransport
      | StreamableHTTPClientTransport
      | SSEClientTransport;
    if (def.transportType === "sse") {
      transport = new SSEClientTransport(new URL(def.url));
    } else if ("url" in def) {
      // @ts-expect-error - Support new streamable http transport when url only
      transport = new StreamableHTTPClientTransport(new URL(def.url));
    } else if (def.transportType === "stdio" || "command" in def) {
      transport = new StdioClientTransport({
        command: def.command,
        args: def.args,
        env: {
          ...(process.env as any),
          ...def.env,
        },
        cwd: Deno.cwd(),
      });
    } else {
      throw new Error(`Unsupported transport type: ${JSON.stringify(def)}`);
    }

    const client = new Client({ name, version: "1.0.0" });
    const serverId = generateId(7);

    try {
      // Create the MCP client
      await client.connect(transport);

      // Get the tools from the client
      const { tools } = await client.listTools();

      // Add the tools to the allTools object
      tools.forEach((tool) => {
        const { toolNameWithScope, toolName: internalToolName } =
          smitheryToolNameCompatibale(tool.name, name);
        // Provider restriction: tools.0.custom.input_schema.properties: Property keys should match pattern '^[a-zA-Z0-9_-]{1,64}$
        // While server name with scope may not match this pattern, we can use it as a unique ID to solve tool name collision
        const toolId = `${serverId}_${internalToolName}`;
        if (
          filterIn &&
          !filterIn({
            action: internalToolName,
            tool,
            mcpName: name,
            toolNameWithScope,
            internalToolName,
            toolId,
          })
        ) {
          return;
        }
        const execute = (args: any) =>
          client.callTool({ name: internalToolName, arguments: args });
        tool.execute = execute;
        allTools[toolId] = tool;
      });
    } catch (error) {
      console.error(`Error creating MCP client for ${name}:`, error);
    }
  }

  return allTools;
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
