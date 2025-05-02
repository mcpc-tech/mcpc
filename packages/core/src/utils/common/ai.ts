import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
  Implementation,
} from "@modelcontextprotocol/sdk/types.js";
import process from "node:process";

import { experimental_createMCPClient, Schema } from "ai";
import { Experimental_StdioMCPTransport } from "ai/mcp-stdio";
import { McpSettingsSchema, StdioConfigSchema } from "../../service/tools.ts";
import {
  Server,
  type ServerOptions,
} from "@modelcontextprotocol/sdk/server/index.js";
import z from "zod";

import { load } from "cheerio";

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

export class AgentMCPServer extends Server {
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
export function parseTags(htmlString: string, tags: Array<string>) {
  const $ = load(htmlString, { xml: true });

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
    toolName: string;
    tool: any;
    mcpName: string;
  }) => boolean
): Promise<Record<string, any>> {
  const allTools: Record<string, any> = {};

  // Process each MCP definition sequentially
  for (const [name, defination] of Object.entries(mcpConfig.mcpServers)) {
    const def = defination as z.infer<typeof StdioConfigSchema>;

    if (def.disabled) {
      continue;
    }

    try {
      // Create the MCP client
      const client = await experimental_createMCPClient({
        name: name,
        transport: new Experimental_StdioMCPTransport({
          command: def.command,
          args: def.args,
          env: {
            ...(process.env as any),
            ...def.env,
          },
          cwd: Deno.cwd(),
        }),
      });

      // Get the tools from the client
      const tools = await client.tools();

      // Add the tools to the allTools object
      Object.entries(tools).forEach(([toolName, tool]) => {
        if (filterIn && !filterIn({ toolName, tool, mcpName: name })) {
          return;
        }
        const fullToolName = `${name}.${toolName}`;
        allTools[fullToolName] = tool;
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
  server: AgentMCPServer,
  tools: Record<string, any>
): AgentMCPServer {
  Object.entries(tools).forEach(([name, tool]) => {
    // Register the tool with the server
    server.tool(
      name,
      tool.description ?? "",
      tool.parameters.jsonSchema,
      tool.execute
    );
  });

  return server as AgentMCPServer;
}
