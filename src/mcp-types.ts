/**
 * AUTO-GENERATED MCP Types
 * Generated on: 2025-05-04T01:37:28.593Z
 * 
 * This file contains TypeScript types for MCP servers and tools
 * based on data from the Smithery Registry API.
 */

/**
 * All available MCP tools organized by server
 */
export const MCP_TOOLS = {
  "@browserbasehq/mcp_browserbase": {
    /**
     * Create a new cloud browser session using Browserbase
     */
    "browserbase_create_session": "browserbase_create_session",
    /**
     * Navigate to a URL
     */
    "browserbase_navigate": "browserbase_navigate",
    /**
     * Takes a screenshot of the current page. Use this tool to learn where you are on the page when controlling the browser with Stagehand. Only use this tool when the other tools are not sufficient to get the information you need.
     */
    "browserbase_screenshot": "browserbase_screenshot",
    /**
     * Click an element on the page
     */
    "browserbase_click": "browserbase_click",
    /**
     * Fill out an input field
     */
    "browserbase_fill": "browserbase_fill",
    /**
     * Extract all text content from the current page
     */
    "browserbase_get_text": "browserbase_get_text"
  },
  "@smithery_ai/github": {
    /**
     * Create or update a single file in a GitHub repository
     */
    "create_or_update_file": "create_or_update_file",
    /**
     * Search for GitHub repositories
     */
    "search_repositories": "search_repositories",
    /**
     * Create a new GitHub repository in your account
     */
    "create_repository": "create_repository",
    /**
     * Get the contents of a file or directory from a GitHub repository
     */
    "get_file_contents": "get_file_contents",
    /**
     * Push multiple files to a GitHub repository in a single commit
     */
    "push_files": "push_files",
    /**
     * Create a new issue in a GitHub repository
     */
    "create_issue": "create_issue",
    /**
     * Create a new pull request in a GitHub repository
     */
    "create_pull_request": "create_pull_request",
    /**
     * Fork a GitHub repository to your account or specified organization
     */
    "fork_repository": "fork_repository",
    /**
     * Create a new branch in a GitHub repository
     */
    "create_branch": "create_branch",
    /**
     * Get list of commits of a branch in a GitHub repository
     */
    "list_commits": "list_commits",
    /**
     * List issues in a GitHub repository with filtering options
     */
    "list_issues": "list_issues",
    /**
     * Update an existing issue in a GitHub repository
     */
    "update_issue": "update_issue",
    /**
     * Add a comment to an existing issue
     */
    "add_issue_comment": "add_issue_comment",
    /**
     * Search for code across GitHub repositories
     */
    "search_code": "search_code",
    /**
     * Search for issues and pull requests across GitHub repositories
     */
    "search_issues": "search_issues",
    /**
     * Search for users on GitHub
     */
    "search_users": "search_users",
    /**
     * Get details of a specific issue in a GitHub repository.
     */
    "get_issue": "get_issue"
  },
  "@smithery_ai/server_sequential_thinking": {
    /**
     * A detailed tool for dynamic and reflective problem-solving through thoughts.
This tool helps analyze problems through a flexible thinking process that can adapt and evolve.
Each thought can build on, question, or revise previous insights as understanding deepens.

When to use this tool:
- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope might not be clear initially
- Problems that require a multi-step solution
- Tasks that need to maintain context over multiple steps
- Situations where irrelevant information needs to be filtered out

Key features:
- You can adjust total_thoughts up or down as you progress
- You can question or revise previous thoughts
- You can add more thoughts even after reaching what seemed like the end
- You can express uncertainty and explore alternative approaches
- Not every thought needs to build linearly - you can branch or backtrack
- Generates a solution hypothesis
- Verifies the hypothesis based on the Chain of Thought steps
- Repeats the process until satisfied
- Provides a correct answer

Parameters explained:
- thought: Your current thinking step, which can include:
* Regular analytical steps
* Revisions of previous thoughts
* Questions about previous decisions
* Realizations about needing more analysis
* Changes in approach
* Hypothesis generation
* Hypothesis verification
- next_thought_needed: True if you need more thinking, even if at what seemed like the end
- thought_number: Current number in sequence (can go beyond initial total if needed)
- total_thoughts: Current estimate of thoughts needed (can be adjusted up/down)
- is_revision: A boolean indicating if this thought revises previous thinking
- revises_thought: If is_revision is true, which thought number is being reconsidered
- branch_from_thought: If branching, which thought number is the branching point
- branch_id: Identifier for the current branch (if any)
- needs_more_thoughts: If reaching end but realizing more thoughts needed

You should:
1. Start with an initial estimate of needed thoughts, but be ready to adjust
2. Feel free to question or revise previous thoughts
3. Don't hesitate to add more thoughts if needed, even at the "end"
4. Express uncertainty when present
5. Mark thoughts that revise previous thinking or branch into new paths
6. Ignore information that is irrelevant to the current step
7. Generate a solution hypothesis when appropriate
8. Verify the hypothesis based on the Chain of Thought steps
9. Repeat the process until satisfied with the solution
10. Provide a single, ideally correct answer as the final output
11. Only set next_thought_needed to false when truly done and a satisfactory answer is reached
     */
    "sequentialthinking": "sequentialthinking"
  },
  "@smithery/toolbox": {
    /**
     * Search for Model Context Protocol (MCP) servers in the Smithery MCP registry. MCPs are tools that allow you to interact with other services to perform tasks. This tool allows you to find MCP servers by name, description, or other attributes. Each server on the registry comes with a set of available tools, which can be used once added.
     */
    "search_servers": "search_servers",
    /**
     * Execute a specific tool call on an MCP server. You must add the server first before invoking the tool calls on the server.
     */
    "use_tool": "use_tool",
    /**
     * Adds a server to your toolbox. Once added, the tools available from this server will be returned to you and available for you to call. When you run into errors adding a server, do not keep adding additional tools. Ask the user for what to do next.
     */
    "add_server": "add_server",
    /**
     * Removes a server and all its tools from the toolbox. The server and its tools will no longer be available for use until they are added again.
     */
    "remove_server": "remove_server"
  },
  "@wonderwhy_er/desktop_commander": {
    /**
     * Execute a terminal command with timeout. Command will continue running in background if it doesn't complete within timeout.
     */
    "execute_command": "execute_command",
    /**
     * Read new output from a running terminal session.
     */
    "read_output": "read_output",
    /**
     * Force terminate a running terminal session.
     */
    "force_terminate": "force_terminate",
    /**
     * List all active terminal sessions.
     */
    "list_sessions": "list_sessions",
    /**
     * List all running processes. Returns process information including PID, command name, CPU usage, and memory usage.
     */
    "list_processes": "list_processes",
    /**
     * Terminate a running process by PID. Use with caution as this will forcefully terminate the specified process.
     */
    "kill_process": "kill_process",
    /**
     * Add a command to the blacklist. Once blocked, the command cannot be executed until unblocked.
     */
    "block_command": "block_command",
    /**
     * Remove a command from the blacklist. Once unblocked, the command can be executed normally.
     */
    "unblock_command": "unblock_command",
    /**
     * List all currently blocked commands.
     */
    "list_blocked_commands": "list_blocked_commands",
    /**
     * Read the complete contents of a file from the file system. Handles various text encodings and provides detailed error messages if the file cannot be read. Only works within allowed directories.
     */
    "read_file": "read_file",
    /**
     * Read the contents of multiple files simultaneously. Each file's content is returned with its path as a reference. Failed reads for individual files won't stop the entire operation. Only works within allowed directories.
     */
    "read_multiple_files": "read_multiple_files",
    /**
     * Completely replace file contents. Best for large changes (>20% of file) or when edit_block fails. Use with caution as it will overwrite existing files. Only works within allowed directories.
     */
    "write_file": "write_file",
    /**
     * Create a new directory or ensure a directory exists. Can create multiple nested directories in one operation. Only works within allowed directories.
     */
    "create_directory": "create_directory",
    /**
     * Get a detailed listing of all files and directories in a specified path. Results distinguish between files and directories with [FILE] and [DIR] prefixes. Only works within allowed directories.
     */
    "list_directory": "list_directory",
    /**
     * Move or rename files and directories. Can move files between directories and rename them in a single operation. Both source and destination must be within allowed directories.
     */
    "move_file": "move_file",
    /**
     * Recursively search for files and directories matching a pattern. Searches through all subdirectories from the starting path. Only searches within allowed directories.
     */
    "search_files": "search_files",
    /**
     * Search for text/code patterns within file contents using ripgrep. Fast and powerful search similar to VS Code search functionality. Supports regular expressions, file pattern filtering, and context lines. Only searches within allowed directories.
     */
    "search_code": "search_code",
    /**
     * Retrieve detailed metadata about a file or directory including size, creation time, last modified time, permissions, and type. Only works within allowed directories.
     */
    "get_file_info": "get_file_info",
    /**
     * Returns the list of directories that this server is allowed to access.
     */
    "list_allowed_directories": "list_allowed_directories",
    /**
     * Apply surgical text replacements to files. Best for small changes (<20% of file size). Multiple blocks can be used for separate changes. Will verify changes after application. Format: filepath, then <<<<<<< SEARCH, content to find, =======, new content, >>>>>>> REPLACE.
     */
    "edit_block": "edit_block"
  }
} as const;

/**
 * All available tool names across all servers
 */
export const ALL_MCP_TOOLS = {
  add_issue_comment: "add_issue_comment",
  add_server: "add_server",
  block_command: "block_command",
  browserbase_click: "browserbase_click",
  browserbase_create_session: "browserbase_create_session",
  browserbase_fill: "browserbase_fill",
  browserbase_get_text: "browserbase_get_text",
  browserbase_navigate: "browserbase_navigate",
  browserbase_screenshot: "browserbase_screenshot",
  create_branch: "create_branch",
  create_directory: "create_directory",
  create_issue: "create_issue",
  create_or_update_file: "create_or_update_file",
  create_pull_request: "create_pull_request",
  create_repository: "create_repository",
  edit_block: "edit_block",
  execute_command: "execute_command",
  force_terminate: "force_terminate",
  fork_repository: "fork_repository",
  get_file_contents: "get_file_contents",
  get_file_info: "get_file_info",
  get_issue: "get_issue",
  kill_process: "kill_process",
  list_allowed_directories: "list_allowed_directories",
  list_blocked_commands: "list_blocked_commands",
  list_commits: "list_commits",
  list_directory: "list_directory",
  list_issues: "list_issues",
  list_processes: "list_processes",
  list_sessions: "list_sessions",
  move_file: "move_file",
  push_files: "push_files",
  read_file: "read_file",
  read_multiple_files: "read_multiple_files",
  read_output: "read_output",
  remove_server: "remove_server",
  search_code: "search_code",
  search_files: "search_files",
  search_issues: "search_issues",
  search_repositories: "search_repositories",
  search_servers: "search_servers",
  search_users: "search_users",
  sequentialthinking: "sequentialthinking",
  unblock_command: "unblock_command",
  update_issue: "update_issue",
  use_tool: "use_tool",
  write_file: "write_file"
} as const;

export type MCPToolName = typeof ALL_MCP_TOOLS[keyof typeof ALL_MCP_TOOLS];

/**
 * Interface for MCP tool information
 */
export interface MCPTool {
  name: MCPToolName;
  description: string | null;
}

/**
 * All available MCP servers
 */
export const MCP_SERVERS = {
  "@browserbasehq/mcp_browserbase": "@browserbasehq/mcp-browserbase",
  "@smithery_ai/github": "@smithery-ai/github",
  "@smithery_ai/server_sequential_thinking": "@smithery-ai/server-sequential-thinking",
  "@smithery/toolbox": "@smithery/toolbox",
  "@wonderwhy_er/desktop_commander": "@wonderwhy-er/desktop-commander"
} as const;

export type MCPServerName = typeof MCP_SERVERS[keyof typeof MCP_SERVERS];

/**
 * Server details with their available tools
 */
export const MCP_SERVER_TOOLS: Record<MCPServerName, MCPToolName[]> = {
  [MCP_SERVERS["@browserbasehq/mcp_browserbase"]]: [ALL_MCP_TOOLS["browserbase_create_session"], ALL_MCP_TOOLS["browserbase_navigate"], ALL_MCP_TOOLS["browserbase_screenshot"], ALL_MCP_TOOLS["browserbase_click"], ALL_MCP_TOOLS["browserbase_fill"], ALL_MCP_TOOLS["browserbase_get_text"]],
  [MCP_SERVERS["@smithery_ai/github"]]: [ALL_MCP_TOOLS["create_or_update_file"], ALL_MCP_TOOLS["search_repositories"], ALL_MCP_TOOLS["create_repository"], ALL_MCP_TOOLS["get_file_contents"], ALL_MCP_TOOLS["push_files"], ALL_MCP_TOOLS["create_issue"], ALL_MCP_TOOLS["create_pull_request"], ALL_MCP_TOOLS["fork_repository"], ALL_MCP_TOOLS["create_branch"], ALL_MCP_TOOLS["list_commits"], ALL_MCP_TOOLS["list_issues"], ALL_MCP_TOOLS["update_issue"], ALL_MCP_TOOLS["add_issue_comment"], ALL_MCP_TOOLS["search_code"], ALL_MCP_TOOLS["search_issues"], ALL_MCP_TOOLS["search_users"], ALL_MCP_TOOLS["get_issue"]],
  [MCP_SERVERS["@smithery_ai/server_sequential_thinking"]]: [ALL_MCP_TOOLS["sequentialthinking"]],
  [MCP_SERVERS["@smithery/toolbox"]]: [ALL_MCP_TOOLS["search_servers"], ALL_MCP_TOOLS["use_tool"], ALL_MCP_TOOLS["add_server"], ALL_MCP_TOOLS["remove_server"]],
  [MCP_SERVERS["@wonderwhy_er/desktop_commander"]]: [ALL_MCP_TOOLS["execute_command"], ALL_MCP_TOOLS["read_output"], ALL_MCP_TOOLS["force_terminate"], ALL_MCP_TOOLS["list_sessions"], ALL_MCP_TOOLS["list_processes"], ALL_MCP_TOOLS["kill_process"], ALL_MCP_TOOLS["block_command"], ALL_MCP_TOOLS["unblock_command"], ALL_MCP_TOOLS["list_blocked_commands"], ALL_MCP_TOOLS["read_file"], ALL_MCP_TOOLS["read_multiple_files"], ALL_MCP_TOOLS["write_file"], ALL_MCP_TOOLS["create_directory"], ALL_MCP_TOOLS["list_directory"], ALL_MCP_TOOLS["move_file"], ALL_MCP_TOOLS["search_files"], ALL_MCP_TOOLS["search_code"], ALL_MCP_TOOLS["get_file_info"], ALL_MCP_TOOLS["list_allowed_directories"], ALL_MCP_TOOLS["edit_block"]]
};

/**
 * Helper function to check if a server supports a specific tool
 */
export function serverSupportsTool(serverName: MCPServerName, toolName: MCPToolName): boolean {
  return MCP_SERVER_TOOLS[serverName].includes(toolName);
}
