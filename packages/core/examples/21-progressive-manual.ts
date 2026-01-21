/**
 * MCPC Example 21: Progressive Manual Disclosure
 *
 * Demonstrates the `manual` feature for agentic tools:
 * - Short description shown by default (reduces token usage)
 * - Full manual fetched via `man { manual: true }` when needed
 *
 * This is useful for complex agents with detailed instructions.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type ComposeDefinition, mcpc } from "../mod.ts";

export const toolDefinitions: ComposeDefinition[] = [
  {
    name: "code-reviewer",
    // Short description - shown in tool listing (tokens saved!)
    description:
      "AI code reviewer that analyzes code quality, security, and best practices.",

    // Full manual with tool references - fetched via `man { manual: true }`
    // Note: <tool> tags are parsed from both description AND manual
    manual:
      `I am an expert code reviewer that helps developers improve their code quality.

Available tools:
<tool name="@wonderwhy-er/desktop-commander.list_directory"/>
<tool name="@wonderwhy-er/desktop-commander.read_file"/>
<tool name="@wonderwhy-er/desktop-commander.write_file"/>
<tool name="@wonderwhy-er/desktop-commander.create_directory"/>

## Review Categories

### 1. Code Quality
- Code readability and maintainability
- Naming conventions and consistency
- Function/method complexity (cyclomatic complexity)
- Code duplication detection

### 2. Security Analysis
- SQL injection vulnerabilities
- XSS (Cross-Site Scripting) risks
- Hardcoded credentials or secrets
- Input validation issues
- Authentication/authorization flaws

### 3. Performance
- Algorithm efficiency (Big O analysis)
- Memory leaks
- N+1 query problems
- Unnecessary computations

### 4. Best Practices
- SOLID principles adherence
- Design pattern usage
- Error handling
- Logging and debugging support

## Output Format
I provide structured feedback with:
- Severity level (Critical, Warning, Info)
- File and line number
- Issue description
- Suggested fix with code example

I always explain my reasoning and prioritize issues by impact.`,

    deps: {
      mcpServers: {
        "@wonderwhy-er/desktop-commander": {
          command: "npx",
          args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
          transportType: "stdio" as const,
        },
      },
    },
    options: {
      mode: "agentic",
    },
  },
];

export const server = await mcpc(
  [
    {
      name: "progressive-manual-example",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {
          listChanged: true,
        },
      },
    },
  ],
  toolDefinitions,
);

const transport = new StdioServerTransport();
await server.connect(transport);
