/**
 * Example: Background Code Analysis Agent
 *
 * This example demonstrates an MCP server that autonomously analyzes
 * code changes in the background, checking for code quality issues
 * and suggesting improvements following KISS principles.
 *
 * Features:
 * - Asynchronous background analysis using git diff
 * - Non-blocking operation
 * - Simple, focused analysis on KISS principles
 * - Built with MCPC framework for simplicity
 *
 * Run with:
 * deno run --allow-all examples/background_code_analysis.ts
 */

import { mcpc } from "../../core/mod.ts";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMCPSamplingProvider } from "../mod.ts";
import { generateText, jsonSchema, stepCountIs, tool } from "ai";
import process from "node:process";
import { convertToAISDKTools } from "../../core/src/ai-sdk-adapter.ts";

// Store analysis results
const analysisResults = new Map<
  string,
  {
    status: "pending" | "completed" | "failed";
    result?: string;
    error?: string;
  }
>();

// Create a simple file utils server for demonstration
const fileUtilsServer = await mcpc(
  [
    { name: "file-utils", version: "1.0.0" },
    { capabilities: { tools: {}, sampling: {} } },
  ],
  [
    {
      name: "analyze-code-changes",
      description: `Analyze code changes for KISS principle violations.`,
      options: {
        mode: "agentic",
        refs: [
          // Code search/navigation
          '<tool name="claude-code.Read"/>',
          '<tool name="claude-code.Grep"/>',
          '<tool name="claude-code.Glob"/>',
          // Execute commands for analysis (e.g., run linters, tests)
          '<tool name="claude-code.Bash"/>',
          '<tool name="claude-code.BashOutput"/>',
          // Task management for tracking analysis steps and recommendations
          '<tool name="claude-code.Task"/>',
          '<tool name="claude-code.TodoWrite"/>',
        ],
      },
      deps: {
        mcpServers: {
          // You MUST have claude-code installed globally, @anthropic-ai/claude-code
          "claude-code": {
            command: "claude",
            args: ["mcp", "serve"],
            env: {
              PATH: `${process.env.HOME}/.volta/bin:${process.env.PATH}`,
            },
          },
        },
      },
    },
  ],
);

// Create MCPC server
const server = await mcpc(
  [
    { name: "code-analyzer", version: "1.0.0" },
    { capabilities: { tools: {}, sampling: {} } },
  ],
  [],
);

// Get git diff for changed files
async function getGitDiff(workDir: string, filePath?: string): Promise<string> {
  const { promisify } = await import("node:util");
  const { execFile } = await import("node:child_process");
  const execFilePromise = promisify(execFile);

  const args = filePath ? ["diff", "HEAD", filePath] : ["diff", "HEAD"];

  try {
    const { stdout } = await execFilePromise("git", args, { cwd: workDir });
    return stdout;
  } catch (error: any) {
    throw new Error(`Git diff failed: ${error.message}`);
  }
}

// Background analysis function
async function analyzeCodeInBackground(
  analysisId: string,
  workDir: string,
  filePath: string | undefined,
  server: any,
) {
  try {
    console.log(`🔍 [${analysisId}] Starting background analysis...`);

    // Get git diff
    const diff = await getGitDiff(workDir, filePath);

    if (!diff.trim()) {
      analysisResults.set(analysisId, {
        status: "completed",
        result: "No changes detected in git diff.",
      });
      console.log(`✅ [${analysisId}] No changes to analyze`);
      return;
    }

    console.log(
      `📝 [${analysisId}] Found ${diff.split("\n").length} lines of changes`,
    );

    // Create MCP sampling provider
    const provider = createMCPSamplingProvider({ server });

    // Simple, focused prompt following KISS principles
    const result = await generateText({
      stopWhen: stepCountIs(9),
      tools: convertToAISDKTools(fileUtilsServer, { tool, jsonSchema }),
      onStepFinish: (step) => {
        console.log(`📊 [${analysisId}] Step completed:`);
        if (step.text) {
          console.log(`   💬 Text:`, step.text);
        }
        if (step.toolResults) {
          console.log(
            `   ✅ Tool Results:`,
            JSON.stringify(
              step.toolResults.map((result) => ({
                input: result.input,
                output: result.output,
              })),
              null,
              2,
            ),
          );
        }
      },
      model: provider.languageModel({
        modelPreferences: {
          hints: [{ name: "copilot/gpt-5-mini" }],
          intelligencePriority: 0.8,
        },
      }),
      prompt:
        `You are a code quality analyst tasked with reviewing code changes for KISS (Keep It Simple, Stupid) principle violations.

## Task Overview
Analyze the following git diff and provide actionable suggestions to simplify the code.

## Working Directory
${workDir}

${
          filePath
            ? `## Target File\n${filePath}\n`
            : "## Changed Files\nAll changed files in the repository\n"
        }

## Git Diff
\`\`\`diff
${diff}
\`\`\`

## Analysis Steps
1. **Understand the Project Context**
   - First, explore the repository structure to understand the project
   - Read relevant files to understand the codebase architecture
   - Identify the purpose and patterns used in the project

2. **Analyze the Changes**
   - Review the git diff line by line
   - Identify what functionality was added or modified
   - Understand the intent behind the changes

3. **Evaluate Against KISS Principles**
   Focus on:
   - Over-engineering or unnecessary complexity in the changes
   - Code that could be simplified without losing functionality
   - Abstraction layers that might be excessive
   - Dependencies or patterns that add complexity unnecessarily

4. **Provide Clear Recommendations**
   For each issue found:
   - Explain what is overly complex
   - Suggest a simpler alternative
   - Show concrete code examples where helpful
   - Explain why the simpler approach is better

Keep suggestions practical, specific, and actionable.`,
    });

    // Store completed result
    analysisResults.set(analysisId, {
      status: "completed",
      result: result.text,
    });

    console.log(`✅ [${analysisId}] Analysis completed`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    analysisResults.set(analysisId, {
      status: "failed",
      error: errorMessage,
    });
    console.error(`❌ [${analysisId}] Analysis failed:`, errorMessage);
  }
}

// Register tool: analyze-code-changes
server.tool(
  "analyze-code-changes",
  "Analyze code changes for KISS principle violations when code is modified. Uses git diff to detect changes and runs analysis in background.",
  {
    type: "object",
    properties: {
      workDir: {
        type: "string",
        description: "Absolute path to the git repository/working directory",
      },
      filePath: {
        type: "string",
        description:
          "Specific file to analyze (optional, analyzes all changes if not provided)",
      },
    },
    required: ["workDir"],
  },
  (args) => {
    const { workDir, filePath } = args as {
      workDir: string;
      filePath?: string;
    };

    // Generate unique analysis ID
    const analysisId = `analysis_${Date.now()}_${
      Math.random()
        .toString(36)
        .substring(7)
    }`;

    // Mark as pending
    analysisResults.set(analysisId, { status: "pending" });

    // Start analysis in background (non-blocking)
    analyzeCodeInBackground(analysisId, workDir, filePath, server);

    // Return immediately
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              analysisId,
              status: "pending",
              workDir,
              ...(filePath && { filePath }),
              message:
                "Analysis started in background. Use 'get-analysis-result' to check status.",
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// Register tool: get-analysis-result
server.tool(
  "get-analysis-result",
  "Get the result of a previous code analysis",
  {
    type: "object",
    properties: {
      analysisId: {
        type: "string",
        description: "Analysis ID from analyze-code-changes",
      },
    },
    required: ["analysisId"],
  },
  (args) => {
    const { analysisId } = args as { analysisId: string };

    const result = analysisResults.get(analysisId);

    if (!result) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: "Analysis not found",
                analysisId,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              analysisId,
              status: result.status,
              ...(result.result && { analysis: result.result }),
              ...(result.error && { error: result.error }),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// Start server
async function main() {
  console.log("🎯 Background Code Analysis Agent");
  console.log("================================\n");
  console.log("This server demonstrates:");
  console.log("  ✓ Asynchronous code analysis with git diff");
  console.log("  ✓ Non-blocking operation");
  console.log("  ✓ KISS principle validation");
  console.log("  ✓ Built with MCPC framework\n");

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.log("✅ Server ready (stdio mode)");
  console.log("   Waiting for tool calls...\n");
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
