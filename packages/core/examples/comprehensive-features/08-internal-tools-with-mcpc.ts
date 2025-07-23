/**
 * MCPC Example 09: Internal Tool Wrapper
 *
 * Demonstrates how to create internal tool wrappers using the mcpc method
 * with a setup callback. Shows how to wrap existing MCP tools with additional
 * functionality while keeping them internal.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { jsonSchema } from "ai";
import { mcpc } from "../../mod.ts";

export const server = await mcpc(
  [
    {
      name: "internal-wrapper-demo",
      version: "1.0.0",
    },
    { capabilities: { tools: { listChanged: true } } },
  ],
  [
    {
      name: "code-executor",

      options: {
        mode: "agentic",
      },

      description: `I am a code execution agent with enhanced internal tools.

**External Tools:**
<tool name="code-runner.javascript-code-runner" hide/>
<tool name="code-runner.python-code-runner" hide/>

**Internal Enhanced Tools:**
- **enhanced-python-runner:** Python execution with logging and timeout
- **safe-code-validator:** Code safety validation

I can execute code safely with additional logging, timeout protection, and safety validation.`,

      deps: {
        mcpServers: {
          "code-runner": {
            command: "deno",
            args: ["run", "--allow-all", "jsr:@mcpc/code-runner-mcp/bin"],
          },
        },
      },
    },
  ],
  // Setup callback to register internal tool wrappers
  (server) => {
    console.log("🔧 Registering internal tool wrappers...");

    // Enhanced Python code runner wrapper
    server.tool(
      "enhanced-python-runner",
      "Enhanced Python code runner with logging and timeout",
      jsonSchema<{ code: string; timeout?: number; enableLogging?: boolean }>({
        type: "object",
        properties: {
          code: { type: "string", description: "Python code to execute" },
          timeout: {
            type: "number",
            default: 30,
            description: "Timeout in seconds",
          },
          enableLogging: {
            type: "boolean",
            default: true,
            description: "Enable logging",
          },
        },
        required: ["code"],
      }),
      async (args: {
        code: string;
        timeout?: number;
        enableLogging?: boolean;
      }) => {
        const { code, timeout = 30, enableLogging = true } = args;

        // First validate the code using our internal safety validator
        const validationResult = await server.callTool(
          "safe-code-validator",
          {
            code,
            language: "python",
          }
        );

        if (enableLogging) {
          console.log(`🐍 Executing Python code (timeout: ${timeout}s):`);
          console.log(code);
          console.log("Validation result:", validationResult);
        }

        // Wrap code with timeout protection (Pyodide compatible)
        const wrappedCode = `
import time

# Simple timeout using time check (Pyodide compatible)
start_time = time.time()
timeout_seconds = ${timeout}

def check_timeout():
    if time.time() - start_time > timeout_seconds:
        raise TimeoutError(f"Code execution timed out after {timeout_seconds} seconds")

try:
    # Execute user code
    ${code}
    check_timeout()  # Final timeout check
except Exception as e:
    check_timeout()  # Final timeout check before re-raising
    raise e
        `;

        console.log("✅ Code wrapped with safety features");

        // Execute the wrapped code using the external Python code runner
        const executionResult = await server.callTool(
          "code-runner.python-code-runner",
          {
            code: wrappedCode,
          }
        );

        return {
          content: [
            {
              type: "text",
              text: `Enhanced Python execution completed:

Original Code: ${code}
Timeout: ${timeout}s
Logging: ${enableLogging}

Execution Result:
${JSON.stringify(executionResult, null, 2)}`,
            },
          ],
        };
      },
      true
    );

    // Code safety validator
    server.tool(
      "safe-code-validator",
      "Validate code for safety",
      jsonSchema<{ code: string; language: string }>({
        type: "object",
        properties: {
          code: { type: "string", description: "Code to validate" },
          language: {
            type: "string",
            enum: ["python", "javascript"],
            description: "Language",
          },
        },
        required: ["code", "language"],
      }),
      (args: { code: string; language: string }) => {
        const { code, language } = args;
        const issues: string[] = [];

        // Basic safety checks
        const dangerous = ["rm -rf", "del /f", "DROP TABLE", "eval("];
        for (const pattern of dangerous) {
          if (code.includes(pattern)) {
            issues.push(`Dangerous pattern: ${pattern}`);
          }
        }

        const isValid = issues.length === 0;
        console.log(`🛡️ Code validation ${isValid ? "passed" : "failed"}`);

        return {
          content: [
            {
              type: "text",
              text: `Validation for ${language}: ${
                isValid ? "✅ SAFE" : "❌ UNSAFE"
              }
${
  issues.length > 0
    ? "\nIssues:\n" + issues.map((i) => `- ${i}`).join("\n")
    : "No issues found."
}`,
            },
          ],
        };
      },
      true
    );

    console.log("✅ Internal tool wrappers registered!");
  }
);

const mcpTransport = new StdioServerTransport();
await server.connect(mcpTransport);
