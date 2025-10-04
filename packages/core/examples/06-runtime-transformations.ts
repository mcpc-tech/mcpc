/**
 * Example: Runtime Transformation Hooks
 *
 * This example demonstrates how to use transformInput and transformOutput hooks
 * to intercept and modify tool arguments and results at runtime.
 */

import { mcpc } from "../mod.ts";
import type { ToolPlugin } from "../src/plugin-types.ts";
import { jsonSchema } from "ai";

// Example 1: Input validation and sanitization plugin
const inputSanitizationPlugin: ToolPlugin = {
  name: "input-sanitization",
  transformInput: (args: any) => {
    // Sanitize all string inputs by trimming whitespace
    if (typeof args === "object" && args !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(args)) {
        sanitized[key] = typeof value === "string" ? value.trim() : value;
      }
      return sanitized;
    }
    return args;
  },
};

// Example 2: Output formatting plugin
const outputFormattingPlugin: ToolPlugin = {
  name: "output-formatting",
  transformOutput: (result: any, context) => {
    // Add metadata to all tool results
    if (result && typeof result === "object") {
      return {
        ...result,
        _meta: {
          toolName: context.toolName,
          timestamp: new Date().toISOString(),
          version: "1.0.0",
        },
      };
    }
    return result;
  },
};

// Example 3: Logging plugin
const loggingPlugin: ToolPlugin = {
  name: "call-logger",
  transformInput: (args: any, context) => {
    console.log(`[INPUT] ${context.toolName}:`, JSON.stringify(args));
    return args; // Pass through unchanged
  },
  transformOutput: (result: any, context) => {
    console.log(`[OUTPUT] ${context.toolName}:`, JSON.stringify(result));
    return result; // Pass through unchanged
  },
};

// Example 4: Authentication plugin (not used in main example)
const _authPlugin: ToolPlugin = {
  name: "auth-validator",
  transformInput: (args: any) => {
    // Check if auth token is present
    if (args && typeof args === "object") {
      const token = args.authToken;
      if (!token || token !== "valid-token") {
        throw new Error("Authentication required");
      }
      // Remove auth token from args before passing to tool
      const { authToken: _authToken, ...cleanArgs } = args;
      return cleanArgs;
    }
    return args;
  },
};

// Example 5: Rate limiting plugin (not used in main example)
const _rateLimitPlugin: ToolPlugin = {
  name: "rate-limiter",
  transformInput: (args: any, context) => {
    // Simple rate limit check (in production, use Redis or similar)
    const key = `rate:${context.toolName}`;
    const count = (globalThis as any)[key] || 0;

    if (count >= 10) {
      throw new Error("Rate limit exceeded");
    }

    (globalThis as any)[key] = count + 1;

    // Reset after 1 minute
    setTimeout(() => {
      delete (globalThis as any)[key];
    }, 60000);

    return args;
  },
};

// Example 6: Error enrichment plugin (not used in main example)
const _errorEnrichmentPlugin: ToolPlugin = {
  name: "error-enricher",
  transformOutput: (result: any, context) => {
    // Check if result indicates an error
    if (result && result.isError) {
      return {
        ...result,
        error: {
          ...result.error,
          toolName: context.toolName,
          helpUrl: `https://docs.example.com/errors/${result.error.code}`,
        },
      };
    }
    return result;
  },
};

// Example usage
async function main() {
  const server = await mcpc(
    [{ name: "example-server", version: "1.0.0" }, {}],
    [],
    async (server) => {
      // Add runtime transformation plugins
      await server.addPlugin(inputSanitizationPlugin);
      await server.addPlugin(outputFormattingPlugin);
      await server.addPlugin(loggingPlugin);

      // Register a sample tool
      server.tool(
        "greet",
        "Greet a user",
        jsonSchema({
          type: "object",
          properties: {
            name: { type: "string" },
            message: { type: "string" },
          },
          required: ["name"],
        }),
        (args: any) => {
          const greeting = args.message || "Hello";
          return {
            content: [{
              type: "text",
              text: `${greeting}, ${args.name}!`,
            }],
          };
        },
      );
    },
  );

  // Test the tool - input will be sanitized, output will be formatted and logged
  const result = await server.callTool("greet", {
    name: "  Alice  ", // Will be trimmed by sanitization plugin
    message: "Welcome",
  });

  console.log("\nFinal result:", JSON.stringify(result, null, 2));
}

// Run if this is the main module
if (import.meta.main) {
  main().catch(console.error);
}

/**
 * Output will look like:
 *
 * [INPUT] greet: {"name":"  Alice  ","message":"Welcome"}
 * [OUTPUT] greet: {"content":[{"type":"text","text":"Welcome, Alice!"}],"_meta":{"toolName":"greet","timestamp":"2024-01-01T12:00:00.000Z","version":"1.0.0"}}
 *
 * Final result: {
 *   "content": [
 *     {
 *       "type": "text",
 *       "text": "Welcome, Alice!"
 *     }
 *   ],
 *   "_meta": {
 *     "toolName": "greet",
 *     "timestamp": "2024-01-01T12:00:00.000Z",
 *     "version": "1.0.0"
 *   }
 * }
 */
