/**
 * Tool definitions for MCPC Builder
 */

export const toolDefinitions = [
  {
    name: "search_mcp_servers",
    description:
      "Search the MCP registry to discover available servers and their capabilities. Use single keywords only (no spaces) when searching - e.g., 'github' for Git operations, 'filesystem' for file management, 'database' for data queries. Returns a detailed table showing server names, descriptions, and available tools. Useful for planning your agent composition and discovering what tools are available before building your MCPC configuration.",
    inputSchema: {
      type: "object",
      properties: {
        serverQuery: {
          type: "string",
          description:
            "Single keyword for server names (e.g. 'github', 'filesystem', 'database'). Use one word only, no spaces.",
        },
        toolQuery: {
          type: "string",
          description:
            "Single keyword for tool names (e.g. 'read', 'create', 'query'). Use one word only, no spaces.",
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
      "Create a complete MCPC agent configuration by combining multiple MCP servers into a single intelligent tool. This is the main tool for building custom agents - specify which servers to include, select specific tools from each server, and get a ready-to-use configuration file. Useful when you want to create specialized agents (e.g., a 'code-reviewer' that combines GitHub + filesystem tools, or a 'data-analyst' that uses database + visualization servers). Returns installation commands for VS Code, Cursor, Claude, and other editors, plus environment variable setup instructions.",
    inputSchema: {
      type: "object",
      properties: {
        serverName: {
          type: "string",
          description:
            "Unique name for your agent server (e.g., 'code-reviewer', 'file-manager', 'data-analyst'). This will be used as the configuration filename and server identifier.",
        },
        toolName: {
          type: "string",
          description:
            "Name of the main tool/function your agent provides (e.g., 'review_code', 'manage_files', 'analyze_data'). This is what users will see when calling your agent.",
        },
        description: {
          type: "string",
          description:
            "Detailed description of what the agent does, including what tools it uses, what tasks it performs, and when it's useful. Example: 'A file management agent that uses read_file and write_file tools to handle document operations, useful for content editing and file processing tasks.'",
        },
        serverDeps: {
          type: "array",
          items: { type: "string" },
          description:
            "List of MCP server names to include in your agent (e.g., ['io.github.wonderwhy-er/desktop-commander', 'github.com/modelcontextprotocol/servers/github']). Use search_mcp_servers first to discover available servers and their capabilities.",
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
          description:
            "Tool selection for each server - specify exactly which tools your agent needs. Use '__ALL__' to include all available tools from a server (useful for general-purpose agents), or provide an array of specific tool names (recommended for focused agents). Example: [{'serverName': 'filesystem', 'tools': ['read_file', 'write_file']}, {'serverName': 'github', 'tools': '__ALL__'}]. This controls what capabilities your agent will have and affects its description.",
        },
        mode: {
          type: "string",
          enum: ["agentic", "ai_sampling", "ai_acp"],
          description:
            "Agent execution mode: 'agentic' for interactive step-by-step execution (recommended for most use cases), 'ai_sampling' for autonomous AI SDK execution, 'ai_acp' for coding agents like Claude Code.",
          default: "agentic",
        },
        enableSampling: {
          type: "boolean",
          description:
            "Enable autonomous sampling mode for compatible clients (VS Code, Cursor). When enabled, the agent can make decisions and execute tools automatically without user confirmation for each step. Use with caution - only enable for trusted, well-tested agents.",
          default: false,
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
    description:
      "Retrieve detailed environment variable requirements for specific MCP servers before composing them. Use this to understand what API keys, tokens, or configuration values you'll need to set up (e.g., GitHub tokens, database connection strings, API endpoints). Useful for planning server setup and understanding prerequisites before creating your agent configuration. Returns variable names, descriptions, whether they're required, and example values.",
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
