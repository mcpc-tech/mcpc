/**
 * MCPC Feature Example 03: Advanced Tool Management
 * 
 * This example demonstrates advanced tool management features in MCPC:
 * - Tool overrides and customization
 * - Hidden tools for internal operations
 * - Tool selection with wildcards and filtering
 * - Namespace management and tool organization
 * - Internal tool invocation
 * 
 * Key Concepts:
 * - Tool override attributes (description, hide)
 * - ComposableMCPServer.hiddenTool()
 * - ComposableMCPServer.callInternalTool()
 * - Tool selection patterns and wildcards
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ComposableMCPServer } from "../../src/compose.ts";
import { jsonSchema } from "ai";

/**
 * Example 1: Tool Overrides and Customization
 * 
 * Demonstrates how to override tool descriptions and hide specific tools
 * from the public interface while keeping them available internally.
 */
async function createAdvancedToolManagementServer() {
  // Create a server instance directly for advanced control
  const server = new ComposableMCPServer(
    { name: "advanced-tool-management", version: "1.0.0" },
    { capabilities: { tools: { listChanged: true } } }
  );

  const description = `I am an advanced file management system with sophisticated tool management.

**Public Tools:**
<tool name="@wonderwhy-er/desktop-commander.list_directory" description="List directory contents with enhanced metadata and filtering capabilities"/>
<tool name="@wonderwhy-er/desktop-commander.create_directory" description="Create new directories with automatic permission and structure setup"/>
<tool name="@wonderwhy-er/desktop-commander.move_file" description="Move files with conflict resolution and backup options"/>

**Hidden Internal Tools:**
<tool name="@wonderwhy-er/desktop-commander.delete_file" hide/>
<tool name="@wonderwhy-er/desktop-commander.read_file" hide/>
<tool name="security-logger" hide/>

**Wildcard Tool Selection:**
<tool name="code-runner.__ALL__"/>

I provide enhanced file management with safety features and audit logging.
All destructive operations are logged and require internal validation.`;

  // Compose with tool overrides and hidden tools
  await server.compose(
    "advanced-file-manager",
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
    { mode: "agentic" }
  );

  return server;
}

/**
 * Example 2: Hidden Tools and Internal Operations
 * 
 * Demonstrates creating hidden tools that are not exposed in the public
 * tool list but can be called internally by the server.
 */
function createServerWithHiddenTools() {
  const server = new ComposableMCPServer(
    { name: "secure-operations", version: "1.0.0" },
    { capabilities: { tools: { listChanged: true } } }
  );

  // Register hidden tools that won't appear in the public interface
  server.hiddenTool(
    "audit-logger",
    "Internal audit logging for security and compliance",
    jsonSchema<{ 
      action: string; 
      user?: string; 
      resource: string; 
      level: "info" | "warn" | "error" 
    }>({
      type: "object",
      properties: {
        action: { 
          type: "string", 
          description: "The action being performed" 
        },
        user: { 
          type: "string", 
          description: "User performing the action" 
        },
        resource: { 
          type: "string", 
          description: "Resource being accessed" 
        },
        level: { 
          type: "string", 
          enum: ["info", "warn", "error"],
          description: "Log level"
        }
      },
      required: ["action", "resource", "level"]
    }),
    (args) => {
      // Internal logging logic
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] ${args.level.toUpperCase()}: ${args.action} on ${args.resource}${args.user ? ` by ${args.user}` : ''}`;
      
      console.log("AUDIT LOG:", logEntry);
      
      return {
        content: [
          {
            type: "text",
            text: `Audit log entry created: ${logEntry}`
          }
        ]
      };
    }
  );

  server.hiddenTool(
    "security-validator",
    "Internal security validation for sensitive operations",
    jsonSchema<{ 
      operation: string; 
      path: string; 
      checkType: "permission" | "policy" | "integrity" 
    }>({
      type: "object",
      properties: {
        operation: { 
          type: "string", 
          description: "Operation to validate" 
        },
        path: { 
          type: "string", 
          description: "File or directory path" 
        },
        checkType: { 
          type: "string", 
          enum: ["permission", "policy", "integrity"],
          description: "Type of security check"
        }
      },
      required: ["operation", "path", "checkType"]
    }),
    async (args) => {
      // Security validation logic
      const isValid = await validateSecurityPolicy(args.operation, args.path, args.checkType);
      
      return {
        content: [
          {
            type: "text",
            text: `Security validation ${isValid ? 'PASSED' : 'FAILED'} for ${args.operation} on ${args.path}`
          }
        ]
      };
    }
  );

  // Public tool that uses hidden tools internally
  server.tool(
    "secure-file-delete",
    "Securely delete files with audit logging and validation",
    jsonSchema<{ path: string; user?: string }>({
      type: "object",
      properties: {
        path: { 
          type: "string", 
          description: "Path to file to delete" 
        },
        user: { 
          type: "string", 
          description: "User requesting deletion" 
        }
      },
      required: ["path"]
    }),
    async (args) => {
      try {
        // Step 1: Security validation
        const _validationResult = await server.callInternalTool("security-validator", {
          operation: "delete",
          path: args.path,
          checkType: "permission"
        });

        // Step 2: Audit logging
        await server.callInternalTool("audit-logger", {
          action: "file_delete_attempt",
          user: args.user || "unknown",
          resource: args.path,
          level: "info"
        });

        // Step 3: Perform actual deletion (would call hidden delete tool)
        // const deleteResult = await server.callInternalTool("@wonderwhy-er/desktop-commander.delete_file", {
        //   path: args.path
        // });

        // Step 4: Final audit log
        await server.callInternalTool("audit-logger", {
          action: "file_delete_completed",
          user: args.user || "unknown", 
          resource: args.path,
          level: "info"
        });

        return {
          content: [
            {
              type: "text",
              text: `File ${args.path} has been securely deleted with full audit trail.`
            }
          ]
        };
      } catch (error) {
        // Error audit logging
        await server.callInternalTool("audit-logger", {
          action: "file_delete_failed",
          user: args.user || "unknown",
          resource: args.path,
          level: "error"
        });

        return {
          content: [
            {
              type: "text",
              text: `Failed to delete ${args.path}: ${(error as Error).message}`
            }
          ],
          isError: true
        };
      }
    }
  );

  return server;
}

/**
 * Example 3: Tool Selection Patterns and Wildcards
 * 
 * Demonstrates advanced tool selection patterns including wildcards,
 * namespace filtering, and selective tool inclusion/exclusion.
 */
async function createServerWithAdvancedToolSelection() {
  const server = new ComposableMCPServer(
    { name: "tool-selection-demo", version: "1.0.0" },
    { capabilities: { tools: { listChanged: true } } }
  );

  const description = `I demonstrate advanced tool selection patterns and namespace management.

**Pattern 1: Wildcard Selection**
Select all tools from a specific MCP server:
<tool name="@wonderwhy-er/desktop-commander.__ALL__"/>

**Pattern 2: Specific Tool Selection**
Select individual tools with custom descriptions:
<tool name="code-runner.python-code-runner" description="Execute Python code with enhanced security and monitoring"/>
<tool name="code-runner.javascript-code-runner" description="Execute JavaScript/TypeScript code in a secure sandbox"/>

**Pattern 3: Hidden Tools for Internal Use**
Tools available internally but not exposed to users:
<tool name="browser-automation.browser_close" hide/>
<tool name="browser-automation.browser_clear_cache" hide/>

**Pattern 4: Namespace Organization**
Tools are automatically organized by their MCP server namespace to prevent conflicts.`;

  await server.compose(
    "tool-selection-demo",
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
        "browser-automation": {
          command: "npx",
          args: ["@playwright/mcp@latest"],
        },
      },
    }
  );

  return server;
}

/**
 * Example 4: Dynamic Tool Override Registration
 * 
 * Demonstrates registering tool overrides programmatically after server creation.
 */
async function createServerWithDynamicOverrides() {
  const server = new ComposableMCPServer(
    { name: "dynamic-overrides", version: "1.0.0" },
    { capabilities: { tools: { listChanged: true } } }
  );

  // Register tool overrides programmatically
  server.registerToolOverride("code-runner.python-code-runner", {
    description: "Execute Python code with AI-powered error detection and optimization suggestions",
    hide: false
  });

  server.registerToolOverride("@wonderwhy-er/desktop-commander.delete_file", {
    description: "Safely delete files with automatic backup and recovery options",
    hide: true // Hide destructive operations
  });

  // Override can also be applied to make tools visible with new descriptions
  server.registerToolOverride("internal-diagnostics", {
    description: "Advanced system diagnostics with performance analytics",
    hide: false
  });

  const description = `I am a system with dynamically configured tool overrides.

Available tools are configured at runtime based on:
- Security policies and user permissions
- Feature flags and experimental capabilities
- Environment-specific configurations
- Runtime performance considerations

Tools are automatically optimized for the current context.`;

  await server.compose(
    "dynamic-system",
    description,
    {
      mcpServers: {
        "code-runner": {
          command: "deno",
          args: ["run", "--allow-all", "jsr:@mcpc/code-runner-mcp/bin"],
        },
        "@wonderwhy-er/desktop-commander": {
          command: "npx",
          args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
        },
      },
    }
  );

  return server;
}

/**
 * Helper function for security validation demo
 */
function validateSecurityPolicy(
  operation: string, 
  path: string, 
  checkType: "permission" | "policy" | "integrity"
): Promise<boolean> {
  // Mock security validation logic
  switch (checkType) {
    case "permission":
      // Check if operation is allowed on the path
      return Promise.resolve(!path.includes("/system") && !path.includes("/etc"));
    case "policy":
      // Check against organizational policies
      return Promise.resolve(operation !== "delete" || !path.includes(".config"));
    case "integrity":
      // Check file integrity
      return Promise.resolve(true); // Mock always passes
    default:
      return Promise.resolve(false);
  }
}

/**
 * Demonstration function
 */
async function demonstrateAdvancedToolManagement() {
  console.log("=== Advanced Tool Management Features ===\n");

  // Create servers demonstrating different features
  const basicServer = await createAdvancedToolManagementServer();
  const secureServer = await createServerWithHiddenTools();
  const selectionServer = await createServerWithAdvancedToolSelection();
  const dynamicServer = await createServerWithDynamicOverrides();

  console.log("Created servers with advanced tool management:");
  console.log("1. Tool Overrides & Customization");
  console.log("2. Hidden Tools & Internal Operations");
  console.log("3. Advanced Tool Selection Patterns");
  console.log("4. Dynamic Override Registration\n");

  // Connect servers
  const transports = [
    new StdioServerTransport(),
    new StdioServerTransport(),
    new StdioServerTransport(),
    new StdioServerTransport(),
  ];

  await Promise.all([
    basicServer.connect(transports[0]),
    secureServer.connect(transports[1]),
    selectionServer.connect(transports[2]),
    dynamicServer.connect(transports[3]),
  ]);

  console.log("All servers connected and ready for use!");
}

/**
 * Export all servers for external use
 */
export {
  createAdvancedToolManagementServer,
  createServerWithHiddenTools,
  createServerWithAdvancedToolSelection,
  createServerWithDynamicOverrides,
  demonstrateAdvancedToolManagement
};

/**
 * Key Learning Points:
 * 
 * 1. Tool Overrides:
 *    - Use <tool name="..." description="..."/> to customize descriptions
 *    - Use <tool name="..." hide/> to hide tools from public interface
 *    - registerToolOverride() for programmatic configuration
 * 
 * 2. Hidden Tools:
 *    - hiddenTool() creates tools not exposed in list_tools
 *    - callInternalTool() invokes any tool (public or hidden)
 *    - Useful for internal operations, security, and audit logging
 * 
 * 3. Tool Selection:
 *    - Use __ALL__ wildcard to select all tools from an MCP server
 *    - Namespace prevents tool name conflicts
 *    - Combine specific and wildcard selections as needed
 * 
 * 4. Security & Governance:
 *    - Hide destructive operations behind secure wrappers
 *    - Implement audit logging for compliance
 *    - Validate operations before execution
 *    - Provide safe interfaces for dangerous operations
 * 
 * 5. Best Practices:
 *    - Use descriptive tool names and descriptions
 *    - Implement proper error handling and logging
 *    - Consider security implications of exposed tools
 *    - Organize tools by functionality and access level
 */

/**
 * Usage in Claude Desktop:
 * 
 * ```json
 * {
 *   "mcpServers": {
 *     "advanced-file-mgr": {
 *       "command": "deno",
 *       "args": ["run", "--allow-all", "advanced-tool-management.ts"]
 *     }
 *   }
 * }
 * ```
 */
