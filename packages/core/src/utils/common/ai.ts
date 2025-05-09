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
import { experimental_createMCPClient, Schema, zodSchema } from "ai";
import { Experimental_StdioMCPTransport } from "ai/mcp-stdio";
import {
  McpSettingsSchema,
  ServerConfigSchema,
  StdioConfigSchema,
} from "../../service/tools.ts";
import {
  Server,
  type ServerOptions,
} from "@modelcontextprotocol/sdk/server/index.js";
import z from "zod";

import { CheerioAPI, load } from "cheerio";
import { ZodDiscriminatedUnionOption } from "zod";
import { jsonSchemaToZod } from "json-schema-to-zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { smitheryToolNameCompatibale } from "./registory.ts";

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
        inputSchema: {
          type: "object",
          ...paramsSchema,
        },
      },
    ];
    this.tools = tools;
    this.nameToCb.set(name, cb);

    this.setRequestHandler(ListToolsRequestSchema, () => {
      return { tools: this.tools };
    });

    this.setRequestHandler(CallToolRequestSchema, (request) => {
      // TODO: args type checking
      const { name: n, arguments: args } = request.params;
      return this.nameToCb.get(n)?.(args);
    });
  }

  async compose(
    name: string,
    description: string,
    depsConfig: z.infer<typeof McpSettingsSchema>
  ) {
    const { tagToResults, $ } = parseTags(description, ["tool", "fn"]);

    description = `Context: You are the operational interface for an MCP tool composed of a set of internal tools.
# User Instructions: ${description}
# Task Execution Flow: Your role is to fulfill user instructions by orchestrating a sequence of operations. For each step in this sequence:
- Determine the single most appropriate internal tool required for the current action *now*.
- Anticipate and plan the likely *next* step or possible subsequent actions needed to complete the overall task.
- Your output for the current step MUST clearly specify:
    - The chosen tool for the current step.
- Additionally, *if* subsequent actions are required after the current step, your output MUST also clearly specify:
    - The anticipated tool for the next step. (If no further steps are needed, this item should be omitted).
- Base your decisions for the *current* tool selection and your anticipation for the *next* tool on user instructions, the overall task goal, and the results from any previous steps.
**Crucial Directive: Any internal tool name you identify in your output must be treated strictly as an argument/parameter; NEVER attempt to directly call or execute the internal tool it names.**`;
    const tools = await composeMcpDepTools(
      depsConfig,
      ({ mcpName, internalToolName }) => {
        return tagToResults.tool.find((tool) => {
          description = description.replace(
            $(tool).prop("outerHTML")!,
            `<tool name="${name}" internalToolName="${tool.attribs.name}"/>`
          );
          return tool.attribs.name === `${mcpName}.${internalToolName}`;
        });
      }
    );

    console.log(`[${name}][composed tools] ${Object.keys(tools)}`);

    const allToolNames = tagToResults.tool.map((v) => v.attribs.name);

    // For now, z.discriminatedUnion is not well supported by json-schema-to-zod.
    // const argsDef = zodSchema(
    //   z.discriminatedUnion(
    //     "toolName",
    //     tagToResults.tool.map((v, _index) => {
    //       const tool = tools[v.attribs.name];

    //       return eval(jsonSchemaToZod(tool.parameters.jsonSchema))
    //         .describe(tool.description)
    //         .merge(
    //           z
    //             .object({
    //               toolName: z
    //                 .literal(v.attribs.name)
    //                 .describe("The name of the current tool to call"),
    //               nextToolName: z
    //                 .enum(
    //                   tagToResults.tool.map(
    //                     (v) => v.attribs.name as string
    //                   ) as [string, ...string[]]
    //                 )
    //                 .optional()
    //                 .describe(
    //                   "The name of the next tool to call. Specify this if the user request needs additional actions to be fulfilled"
    //                 ),
    //             })
    //             .describe(tool.description)
    //         );
    //     }) as unknown as readonly [
    //       ZodDiscriminatedUnionOption<"toolName">,
    //       ...ZodDiscriminatedUnionOption<"toolName">[]
    //     ]
    //   )
    // ).jsonSchema as Schema;
    const argsDef = {
      oneOf: tagToResults.tool.map((v) => {
        const toolName = v.attribs.name;
        const tool = tools[toolName];

        if (!tool) {
          throw new Error(
            `Tool ${toolName} not found, available toolName list: ${Object.keys(
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
            internalToolName: {
              type: "string",
              enum: allToolNames,
              description: "The name of the current internal tool to call",
            },
            nextInternalToolName: {
              type: "string",
              enum: allToolNames,
              description:
                "The name of the next internal tool to call. Specify this if the user request needs additional actions to be fulfilled",
            },
          },

          required: [...baseRequired, "internalToolName"],
        };
      }),

      discriminator: {
        propertyName: "internalToolName",
      },
    } as unknown as Schema;

    this.tool(name, description, argsDef, async (args: any) => {
      const currentToolElement = tagToResults.tool.find(
        (t) => t.attribs.name === args.internalToolName
      );

      if (!currentToolElement) {
        const error = `[ERROR]Internal tool ${
          args.internalToolName
        } not found, available internalToolName list: ${tagToResults.tool.map(
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
        ...args,
        internalToolName: undefined,
      });

      if (args.nextInternalToolName) {
        currentResult?.content?.unshift({
          type: "text",
          text: `# You MUST call this mcp tool **AGAIN** with **internalToolName=${args.nextInternalToolName}** argument
  # Previous internal tool: ${args.internalToolName}
  # Previous internal tool result`,
        });
      } else {
        currentResult?.content?.unshift({
          type: "text",
          text: `# You MUST plan next action if the user request needs additional actions to be fulfilled
# Previous internal tool result`,
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
    internalToolName: string;
    tool: any;
    mcpName: string;
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

    try {
      // Create the MCP client
      await client.connect(transport);

      // Get the tools from the client
      const { tools } = await client.listTools();

      // Add the tools to the allTools object
      tools.forEach((tool) => {
        const { toolNameWithScope, toolName: internalToolName } =
          smitheryToolNameCompatibale(tool.name, name);

        if (filterIn && !filterIn({ internalToolName, tool, mcpName: name })) {
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
