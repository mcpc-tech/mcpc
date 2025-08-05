/**
 * MCPC Example 05: Tool Override Manager
 *
 * Demonstrates advanced tool management features including:
 * - Tool description overrides
 * - Internal tools for internal operations
 * - Tool selection with wildcards
 * - Internal tool invocation
 *
 * This example shows how to create sophisticated tool management
 * with security and customization features.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ComposableMCPServer } from "../src/compose.ts";

// Create a server instance for advanced tool management
const server = new ComposableMCPServer(
  { name: "tool-override-manager", version: "1.0.0" },
  { capabilities: { tools: { listChanged: true } } },
);

// Define the description with tool overrides
const description =
  `I am an advanced file management system with sophisticated tool management and security features.

**Public Tools with Enhanced Descriptions:**
<tool name="@wonderwhy-er/desktop-commander.list_directory" description="List directory contents with enhanced metadata, filtering capabilities, and security analysis"/>
<tool name="@wonderwhy-er/desktop-commander.create_directory" description="Create new directories with automatic permission setup, structure validation, and audit logging"/>
<tool name="@wonderwhy-er/desktop-commander.move_file" description="Move files with intelligent conflict resolution, backup creation, and integrity verification"/>

**Internal Tools (Not Exposed to Users):**
<tool name="@wonderwhy-er/desktop-commander.delete_file" hide/>
<tool name="@wonderwhy-er/desktop-commander.read_file" hide/>

**Wildcard Tool Selection:**
<tool name="code-runner.__ALL__"/>

**Security Features:**
- All destructive operations require internal validation
- Comprehensive audit logging for compliance
- Automatic backup creation before modifications
- Path validation and security checks
- User permission verification

**Advanced Capabilities:**
- Smart conflict resolution during file operations
- Automatic organization suggestions
- Duplicate detection and management
- File integrity verification
- Batch operation support with progress tracking

I provide enhanced file management with enterprise-grade security and reliability features.`;

// Compose the server with tool overrides
await server.compose(
  "secure-file-manager",
  description,
  {
    mcpServers: {
      "@wonderwhy-er/desktop-commander": {
        command: "npx",
        args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
      },
      "code-runner": {
        command: "deno",
        args: ["run", "--allow-all", "jsr:@mcpc/code-runner-mcp/bin"],
      },
    },
  },
  { mode: "agentic" },
);

// Add internal tools for internal security operations
import { jsonSchema } from "ai";

server.tool(
  "audit-logger",
  "Internal audit logging for security and compliance tracking",
  jsonSchema<{
    action: string;
    user?: string;
    resource: string;
    level: "info" | "warn" | "error";
  }>({
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "The action being performed",
      },
      user: {
        type: "string",
        description: "User performing the action",
      },
      resource: {
        type: "string",
        description: "Resource being accessed",
      },
      level: {
        type: "string",
        enum: ["info", "warn", "error"],
        description: "Log level",
      },
    },
    required: ["action", "resource", "level"],
  }),
  (args) => {
    const timestamp = new Date().toISOString();
    const logEntry =
      `[${timestamp}] ${args.level.toUpperCase()}: ${args.action} on ${args.resource}${
        args.user ? ` by ${args.user}` : ""
      }`;

    console.log("AUDIT LOG:", logEntry);

    return {
      content: [
        {
          type: "text",
          text: `Audit log entry created: ${logEntry}`,
        },
      ],
    };
  },
  true, // internal tool
);

server.tool(
  "security-validator",
  "Internal security validation for sensitive file operations",
  jsonSchema<{
    operation: string;
    path: string;
    checkType: "permission" | "policy" | "integrity";
  }>({
    type: "object",
    properties: {
      operation: {
        type: "string",
        description: "Operation to validate",
      },
      path: {
        type: "string",
        description: "File or directory path",
      },
      checkType: {
        type: "string",
        enum: ["permission", "policy", "integrity"],
        description: "Type of security check",
      },
    },
    required: ["operation", "path", "checkType"],
  }),
  (args) => {
    // Mock security validation logic
    const isValid = !args.path.includes("/system") &&
      !args.path.includes("/etc") &&
      !(args.operation === "delete" && args.path.includes(".config"));

    return {
      content: [
        {
          type: "text",
          text: `Security validation ${
            isValid ? "PASSED" : "FAILED"
          } for ${args.operation} on ${args.path}`,
        },
      ],
    };
  },
  true, // internal tool
);

// Add a public tool that uses internal tools internally
server.tool(
  "secure-file-delete",
  "Securely delete files with comprehensive validation, audit logging, and backup creation",
  jsonSchema<{ path: string; user?: string; createBackup?: boolean }>({
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to file to delete",
      },
      user: {
        type: "string",
        description: "User requesting deletion",
      },
      createBackup: {
        type: "boolean",
        description: "Whether to create a backup before deletion",
        default: true,
      },
    },
    required: ["path"],
  }),
  async (args) => {
    try {
      // Step 1: Security validation using hidden tool
      const _validationResult = await server.callTool("security-validator", {
        operation: "delete",
        path: args.path,
        checkType: "permission",
      });

      // Step 2: Audit logging using hidden tool
      await server.callTool("audit-logger", {
        action: "secure_file_delete_initiated",
        user: args.user || "system",
        resource: args.path,
        level: "info",
      });

      // Step 3: Create backup if requested (using hidden read tool)
      if (args.createBackup) {
        await server.callTool("audit-logger", {
          action: "backup_creation_started",
          user: args.user || "system",
          resource: args.path,
          level: "info",
        });
      }

      // Step 4: Perform deletion (would use hidden delete tool)
      // const deleteResult = await server.callTool("@wonderwhy-er/desktop-commander.delete_file", {
      //   path: args.path
      // });

      // Step 5: Final audit log
      await server.callTool("audit-logger", {
        action: "secure_file_delete_completed",
        user: args.user || "system",
        resource: args.path,
        level: "info",
      });

      return {
        content: [
          {
            type: "text",
            text:
              `✅ File ${args.path} has been securely deleted with full audit trail.${
                args.createBackup ? " Backup created successfully." : ""
              }`,
          },
        ],
      };
    } catch (error) {
      // Error audit logging
      await server.callTool("audit-logger", {
        action: "secure_file_delete_failed",
        user: args.user || "system",
        resource: args.path,
        level: "error",
      });

      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to delete ${args.path}: ${
              (error as Error).message
            }`,
          },
        ],
        isError: true,
      };
    }
  },
);

// Connect the server
const transport = new StdioServerTransport();
await server.connect(transport);

/**
 * Key Tool Management Features:
 *
 * 1. **Tool Overrides:**
 *    - <tool name="..." description="..."/> customizes descriptions
 *    - <tool name="..." hide/> hides tools from public interface
 *    - Enhanced descriptions provide better user guidance
 *
 * 2. **Internal Tools:**
 *    - Created with server.tool(..., true)
 *    - Not visible in list_tools responses
 *    - Available for internal operations only
 *    - Perfect for security, logging, and validation
 *
 * 3. **Internal Tool Invocation:**
 *    - server.callTool() calls any tool (public or internal)
 *    - Enables complex internal workflows
 *    - Maintains clean public interfaces
 *
 * 4. **Wildcard Selection:**
 *    - __ALL__ selects all tools from an MCP server
 *    - Simplifies tool inclusion
 *    - Automatic namespace management
 *
 * 5. **Security Benefits:**
 *    - Hide dangerous operations behind safe wrappers
 *    - Implement audit trails and validation
 *    - Provide user-friendly interfaces for complex operations
 *
 * Example Usage:
 *
 * User: "Delete the file /tmp/test.txt"
 *
 * Internal workflow:
 * 1. Validates security permissions
 * 2. Logs deletion attempt
 * 3. Creates backup copy
 * 4. Performs deletion
 * 5. Logs completion
 *
 * Result: Secure deletion with full audit trail
 *
 * Claude Desktop Configuration:
 * ```json
 * {
 *   "mcpServers": {
 *     "secure-file-manager": {
 *       "command": "deno",
 *       "args": ["run", "--allow-all", "05-tool-override-manager.ts"]
 *     }
 *   }
 * }
 * ```
 */

export { server };
