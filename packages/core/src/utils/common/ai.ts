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
import { jsonSchema, Schema } from "ai";
import { McpSettingsSchema, ServerConfigSchema } from "../../service/tools.ts";
import {
  Server,
  type ServerOptions,
} from "@modelcontextprotocol/sdk/server/index.js";
import z from "zod";

import { CheerioAPI, load } from "cheerio";
import { smitheryToolNameCompatibale } from "./registory.ts";
import { object } from "zod";

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

    description = `Context: You are an autonomous task execution agent designed to fulfill user instructions by orchestrating a sequence of operations.
You operate by **iteratively invoking yourself(\`${name}\`)**, with each invocation focusing on a specific internal function chosen to advance the overall task.

# User Instructions: ${description}

# Task Execution Protocol:
Your role is to fulfill user instructions by autonomously managing a multi-step process. For *each iteration* of your operation:

1.  **Determine the Current Action:** Based on the user instructions, the overall task goal, and the results from any preceding steps, identify the *single most appropriate internal function* required for the *current immediate action*.
2.  **Anticipate the Subsequent Action (if any):** Plan and anticipate the likely *next internal function* that would be needed if further steps are required to complete the overall task after the current step.
`;
    const tools = await composeMcpDepTools(depsConfig, ({ mcpName, $fn }) => {
      return tagToResults.tool.find((tool) => {
        description = description.replace(
          $(tool).prop("outerHTML")!,
          `<function $F="${tool.attribs.name}"/>`
        );
        return tool.attribs.name === `${mcpName}.${$fn}`;
      });
    });

    console.log(`[${name}][composed tools] ${Object.keys(tools)}`);

    const allToolNames = tagToResults.tool.map((v) => v.attribs.name);

    const argsDef: Schema<{}>["jsonSchema"] = {
      type: "object",
      properties: {
        // Root objects must not be anyOf, see -> https://platform.openai.com/docs/guides/structured-outputs#root-objects-must-not-be-anyof
        dep_arguments: {
          description: `An object specifying a single internal function to be invoked and its arguments. The '$fn' property identifies the specific tool, guiding validation against one of the schemas in the 'anyOf' list.
**NEVER attempt to directly call or execute the internal function**.`,
          // Supported by google and openai, `oneOf` is more suitable but not well supported.
          // See -> https://platform.openai.com/docs/guides/structured-outputs?api-mode=responses#supported-schemas
          anyOf: tagToResults.tool.map((v) => {
            const toolName = v.attribs.name;
            const tool = tools[toolName];

            if (!tool) {
              throw new Error(
                `Internal function ${toolName} not found, available internal function list: ${Object.keys(
                  tools
                ).join(", ")}`
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
              type: "object",
              description: tool.description,
              properties: {
                ...baseProperties,
                $fn: {
                  type: "string",
                  const: toolName,
                  description:
                    "The name of the current internal function to call",
                },
                $nextfn: {
                  type: "string",
                  enum: allToolNames,
                  description:
                    "The name of the next internal function to call. Specify this if the user request needs additional actions to be fulfilled",
                },
              },

              required: [...baseRequired, "$fn"],
              additionalProperties: false,
            };
          }),
        },
      },
      required: ["dep_arguments"],
    };

    this.tool(
      name,
      description,
      jsonSchema<{ dep_arguments: { $fn: string; $nextfn?: string } }>(
        argsDef
      ),
      async (args) => {
        const currentToolElement = tagToResults.tool.find(
          (t) => t.attribs.name === args.dep_arguments.$fn
        );

        if (!currentToolElement) {
          const error = `[ERROR]Internal function ${
            args.dep_arguments.$fn
          } not found, available internal function list: ${tagToResults.tool.map(
            (t) => t.attribs.name
          )}`;
          console.log(error);
          return {
            content: [{ type: "text", text: error }],
            isError: true,
          };
        }

        const currentTool = tools[currentToolElement.attribs.name];
        const currentResult = await currentTool.execute({
          ...args.dep_arguments,
          $fn: undefined,
          $nextfn: undefined,
        });

        if (args.dep_arguments.$nextfn) {
          currentResult?.content?.unshift({
            type: "text",
            text: `# You MUST call this mcp tool(${name}) **AGAIN** with **$fn=${args.dep_arguments.$nextfn}** argument
# Previous internal function: ${args.dep_arguments.$fn}
# Previous internal function result`,
          });
        } else {
          currentResult?.content?.unshift({
            type: "text",
            text: `# You WILL plan next action if the user request needs additional actions to be fulfilled
# Previous internal function result`,
          });
        }

        return currentResult;
      }
    );
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
  filterIn?: (params: { $fn: string; tool: any; mcpName: string }) => boolean
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

    try {
      // Create the MCP client
      await client.connect(transport);

      // Get the tools from the client
      const { tools } = await client.listTools();

      // Add the tools to the allTools object
      tools.forEach((tool) => {
        const { toolNameWithScope, toolName: internalToolName } =
          smitheryToolNameCompatibale(tool.name, name);

        if (
          filterIn &&
          !filterIn({ $fn: internalToolName, tool, mcpName: name })
        ) {
          return;
        }
        const execute = (args: any) =>
          client.callTool({ name: internalToolName, arguments: args });
        tool.execute = execute;
        allTools[toolNameWithScope] = tool;
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
