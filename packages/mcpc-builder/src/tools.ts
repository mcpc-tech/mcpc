/**
 * Tool definitions for MCPC Builder
 */

export const toolDefinitions = [
  {
    name: "search_mcp_servers",
    description:
      "Search for MCP servers in the registry by server name and/or tool name. Returns a formatted table with server names, descriptions, and available tools. Results include the union of servers matching either the server name or tool name query.",
    inputSchema: {
      type: "object",
      properties: {
        serverQuery: {
          type: "string",
          description:
            "Search query for server names (e.g. 'github', 'filesystem', 'database')",
        },
        toolQuery: {
          type: "string",
          description:
            "Search query for tool names (e.g. 'read_file', 'create_issue', 'query')",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return",
          default: 20,
        },
      },
      required: ["serverQuery", "toolQuery"],
    },
  },
  {
    name: "compose_mcpc_config",
    description:
      "Generate an MCPC (agentic) configuration that composes multiple MCP servers into a single agentic tool. Returns the configuration JSON along with ready-to-use installation commands for VS Code, Cursor, Claude Desktop, Codex, and Gemini.",
    inputSchema: {
      type: "object",
      properties: {
        serverName: {
          type: "string",
          description: "Name for your agentic server",
        },
        toolName: {
          type: "string",
          description: "Name for the agent tool",
        },
        description: {
          type: "string",
          description: "Description of what the agent does",
        },
        serverDeps: {
          type: "array",
          items: { type: "string" },
          description: "Array of MCP server names to compose",
        },
        mode: {
          type: "string",
          enum: ["agentic", "agentic_workflow"],
          description: "Execution mode for the agent",
          default: "agentic",
        },
        enableSampling: {
          type: "boolean",
          description: "Enable autonomous sampling mode",
          default: false,
        },
        userConfigs: {
          type: "object",
          description: "Environment variables for each server",
          additionalProperties: {
            type: "object",
            additionalProperties: { type: "string" },
          },
        },
      },
      required: ["serverName", "toolName", "description", "serverDeps"],
    },
  },
  {
    name: "get_env_var_schemas",
    description:
      "Get environment variable schemas for multiple servers, including descriptions, required status, and default values.",
    inputSchema: {
      type: "object",
      properties: {
        serverNames: {
          type: "array",
          items: { type: "string" },
          description: "Array of server names to get env vars for",
        },
      },
      required: ["serverNames"],
    },
  },
] as const;
