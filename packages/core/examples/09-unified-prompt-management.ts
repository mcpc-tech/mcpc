/**
 * MCPC Example: Unified Prompt Management
 *
 * This example demonstrates the new centralized prompt management system
 * that consolidates all prompts and templates into a unified structure
 * with dynamic content replacement capabilities.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mcpc } from "../mod.ts";
import { jsonSchema } from "ai";
import {
  CompiledPrompts,
  PromptUtils,
  type ToolDefinition,
} from "../src/prompts/index.ts";

// Type definitions for tool arguments
interface AuditLogArgs {
  action: string;
  user?: string;
  resource: string;
  level: "info" | "warn" | "error";
}

interface SecurityValidationArgs {
  operation: string;
  path: string;
}

// Define available tools with enhanced descriptions
const availableTools: ToolDefinition[] = [
  {
    name: "@wonderwhy-er/desktop-commander.list_directory",
    description:
      "List directory contents with enhanced metadata, filtering capabilities, and security analysis",
  },
  {
    name: "@wonderwhy-er/desktop-commander.create_directory",
    description:
      "Create new directories with automatic permission setup, structure validation, and audit logging",
  },
  {
    name: "@wonderwhy-er/desktop-commander.move_file",
    description:
      "Move files with intelligent conflict resolution, backup creation, and integrity verification",
  },
  {
    name: "@wonderwhy-er/desktop-commander.delete_file",
    hide: true,
  },
  {
    name: "@wonderwhy-er/desktop-commander.read_file",
    hide: true,
  },
  {
    name: "code-runner.__ALL__",
  },
];

// Generate dynamic descriptions using the prompt management system
const publicTools = PromptUtils.generateToolList(availableTools);
const hiddenTools = PromptUtils.generateHiddenToolList(availableTools);
const wildcardTools = availableTools
  .filter((tool) => tool.name.includes("__ALL__"))
  .map((tool) => `<tool name="${tool.name}"/>`)
  .join("\n");

// Use the centralized template system with local description
const fileOperationsDescription =
  `Advanced file management system with sophisticated tool management and security features.

**Public Tools with Enhanced Descriptions:**
{publicTools}

**Internal Tools (Not Exposed to Users):**
{hiddenTools}

**Wildcard Tool Selection:**
{wildcardTools}

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
- Batch operation support with progress tracking`;

const agentDescription = fileOperationsDescription
  .replace("{publicTools}", publicTools)
  .replace("{hiddenTools}", hiddenTools)
  .replace("{wildcardTools}", wildcardTools);

export const server = await mcpc(
  [
    {
      name: "unified-prompt-manager",
      version: "1.0.0",
    },
    { capabilities: { tools: { listChanged: true } } },
  ],
  [
    {
      name: "prompt-managed-agent",

      // Use centralized description template
      description: agentDescription,

      deps: {
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
    },
  ],
  // Demonstrate internal tool registration with centralized prompts
  (server) => {
    server.tool(
      "audit-logger",
      "Internal comprehensive audit logging with standardized format",
      jsonSchema<AuditLogArgs>({
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
        // Use centralized audit log template
        const logMessage = CompiledPrompts.auditLog({
          timestamp: PromptUtils.formatTimestamp(),
          level: args.level.toUpperCase(),
          action: args.action,
          resource: args.resource,
          userInfo: PromptUtils.formatUserInfo(args.user),
        });

        console.log("AUDIT LOG:", logMessage);

        return {
          content: [
            {
              type: "text",
              text: `Audit log entry created: ${logMessage}`,
            },
          ],
        };
      },
      true, // internal tool
    );

    server.tool(
      "security-validator",
      "Internal security validation using centralized templates",
      jsonSchema<SecurityValidationArgs>({
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
        },
        required: ["operation", "path"],
      }),
      (args) => {
        // Mock validation logic
        const isValid = !args.path.includes("/system") &&
          !args.path.includes("/etc");

        const message = isValid
          ? CompiledPrompts.securityPassed({
            operation: args.operation,
            path: args.path,
          })
          : CompiledPrompts.securityFailed({
            operation: args.operation,
            path: args.path,
          });

        return {
          content: [
            {
              type: "text",
              text: message,
            },
          ],
        };
      },
      true, // internal tool
    );

    console.log("✅ Unified prompt management system initialized!");
    console.log(
      "📝 All prompts are now centrally managed and dynamically generated",
    );
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

/**
 * Benefits of the Unified Prompt Management System:
 *
 * 1. **Centralized Management:**
 *    - All prompts stored in one location (/src/prompts/)
 *    - Easy to update and maintain
 *    - Consistent formatting across the application
 *
 * 2. **Dynamic Content Replacement:**
 *    - Template variables for dynamic content
 *    - Type-safe prompt compilation
 *    - Runtime content substitution
 *
 * 3. **Reusable Templates:**
 *    - Common patterns abstracted into templates
 *    - Standardized message formats
 *    - Consistent user experience
 *
 * 4. **Better Organization:**
 *    - Prompts grouped by functionality
 *    - Clear separation of concerns
 *    - Easier to find and modify specific prompts
 *
 * 5. **Enhanced Maintainability:**
 *    - Single source of truth for all text
 *    - Reduces duplication
 *    - Easier to test and validate
 *
 * Usage Examples:
 *
 * ```typescript
 * // Simple template usage
 * const message = CompiledPrompts.toolSuccess({
 *   toolName: "my-tool",
 *   nextAction: "next-step",
 *   currentAction: "current-step"
 * });
 *
 * // Dynamic tool list generation
 * const toolList = PromptUtils.generateToolList(tools);
 *
 * // Template with content replacement
 * const description = ToolDescriptions.BASE_TEMPLATE
 *   .replace('{description}', 'Your tool description')
 *   .replace('{availableTools}', toolsList);
 * ```
 *
 * This approach makes prompt management much more scalable and maintainable
 * as the MCPC ecosystem grows.
 */
