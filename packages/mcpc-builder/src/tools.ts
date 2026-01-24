/**
 * Tool definitions for MCPC Builder
 */

export const toolDefinitions = [
  {
    name: "search_mcp_servers",
    description: "Search mcpc.tech registry for MCP servers by keyword.",
    inputSchema: {
      type: "object",
      properties: {
        serverQuery: {
          type: "string",
          description: "Keyword for server names (e.g. 'github-mcp')",
        },
        toolQuery: {
          type: "string",
          description: "Keyword for tool names (e.g. 'read_file')",
        },
        limit: {
          type: "number",
          description: "Max results (default: 20)",
          default: 20,
        },
      },
      required: ["serverQuery", "toolQuery"],
    },
  },
  {
    name: "compose_mcpc_config",
    description:
      "Generate MCPC agent configuration from selected servers and tools.",
    inputSchema: {
      type: "object",
      properties: {
        serverName: {
          type: "string",
          description: "Agent server name (e.g. 'code-reviewer')",
        },
        toolName: {
          type: "string",
          description: "Main tool name (e.g. 'review_code')",
        },
        description: {
          type: "string",
          description: "What the agent does",
        },
        serverDeps: {
          type: "array",
          items: { type: "string" },
          description: "MCP server names to include",
        },
        toolSelection: {
          type: "array",
          items: {
            type: "object",
            properties: {
              serverName: { type: "string" },
              tools: {
                oneOf: [
                  { type: "array", items: { type: "string" } },
                  { type: "string", enum: ["__ALL__"] },
                ],
              },
            },
            required: ["serverName", "tools"],
          },
          description: "Tools to include: array of names or '__ALL__'",
        },
        mode: {
          type: "string",
          enum: ["agentic", "ai_sampling", "ai_acp"],
          description: "Execution mode",
          default: "agentic",
        },
        enableSampling: {
          type: "boolean",
          description: "Enable autonomous sampling",
          default: false,
        },
        samplingConfig: {
          type: "object",
          description: "Sampling config",
          properties: {
            maxIterations: { type: "number" },
            summarize: { type: "boolean" },
          },
        },
        maxSteps: {
          type: "number",
          description: "Max agentic steps",
        },
        maxTokens: {
          type: "number",
          description: "Max tokens for sampling",
        },
        tracingEnabled: {
          type: "boolean",
          description: "Enable tracing",
        },
      },
      required: [
        "serverName",
        "toolName",
        "description",
        "serverDeps",
        "toolSelection",
      ],
    },
  },
  {
    name: "get_env_var_schemas",
    description: "Get environment variable requirements for servers.",
    inputSchema: {
      type: "object",
      properties: {
        serverNames: {
          type: "array",
          items: { type: "string" },
          description: "Server names to query",
        },
      },
      required: ["serverNames"],
    },
  },
] as const;
