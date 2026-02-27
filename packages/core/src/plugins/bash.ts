/**
 * Bash Plugin - Execute bash commands with output truncation
 *
 * Provides a tool for executing bash commands with:
 * - Output truncation to prevent context pollution
 * - Timeout protection
 * - Proper exit code handling
 */

import { spawn } from "node:child_process";
import process from "node:process";
import type { ToolPlugin } from "../plugin-types.ts";

/** Default max output bytes to prevent context pollution */
const DEFAULT_MAX_BYTES = 100_000;
/** Default max lines to display */
const DEFAULT_MAX_LINES = 2000;
/** Default timeout in milliseconds */
const DEFAULT_TIMEOUT_MS = 60_000;

export interface BashPluginOptions {
  /** Maximum output bytes to return */
  maxBytes?: number;
  /** Maximum output lines to return */
  maxLines?: number;
  /** Command execution timeout in ms */
  timeoutMs?: number;
}

/**
 * Truncate output to prevent context pollution
 */
export function truncateOutput(
  stdout: string,
  stderr: string,
  maxBytes: number = DEFAULT_MAX_BYTES,
  maxLines: number = DEFAULT_MAX_LINES,
): { output: string; truncated: boolean } {
  const fullOutput = (stderr ? `STDERR:\n${stderr}\n\nSTDOUT:\n` : "") + stdout;

  // Check line count first
  const lines = fullOutput.split("\n");
  if (lines.length > maxLines) {
    const truncatedLines = lines.slice(-maxLines);
    return {
      output:
        `[OUTPUT TRUNCATED] Showing last ${maxLines} lines of ${lines.length} total\n\n` +
        truncatedLines.join("\n"),
      truncated: true,
    };
  }

  // Then check byte count
  if (fullOutput.length > maxBytes) {
    const truncatedBytes = fullOutput.slice(-maxBytes);
    return {
      output:
        `[OUTPUT TRUNCATED] Showing last ${maxBytes} bytes of ${fullOutput.length} total\n\n` +
        truncatedBytes,
      truncated: true,
    };
  }

  return { output: fullOutput, truncated: false };
}

/**
 * Execute a bash command
 */
export function executeBash(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    // Use -c to run command string
    const proc = spawn("bash", ["-c", command], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout?.on("data", (data) => {
      stdout.push(data.toString());
    });

    proc.stderr?.on("data", (data) => {
      stderr.push(data.toString());
    });

    proc.on("close", (code) => {
      resolve({
        stdout: stdout.join(""),
        stderr: stderr.join(""),
        exitCode: code,
      });
    });

    proc.on("error", (err) => {
      resolve({
        stdout: "",
        stderr: err.message,
        exitCode: null,
      });
    });

    // Timeout protection
    setTimeout(() => {
      proc.kill("SIGTERM");
      resolve({
        stdout: stdout.join(""),
        stderr: stderr.join("") + "\n\n[TIMEOUT] Command execution timed out",
        exitCode: null,
      });
    }, timeoutMs);
  });
}

/**
 * Create a bash plugin that provides command execution capability
 */
export function createBashPlugin(options: BashPluginOptions = {}): ToolPlugin {
  const { maxBytes, maxLines, timeoutMs } = {
    maxBytes: DEFAULT_MAX_BYTES,
    maxLines: DEFAULT_MAX_LINES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    ...options,
  };

  return {
    name: "plugin-bash",
    version: "1.0.0",

    // Store server reference for tool registration
    configureServer: (server) => {
      // Register bash tool
      server.tool(
        "bash",
        "Execute a bash command and return its output.\n\n" +
          "Use this for:\n" +
          "- Running shell commands\n" +
          "- Executing scripts\n" +
          "- System operations\n\n" +
          "Note: Output is truncated if too large.",
        {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "The bash command to execute",
            },
            cwd: {
              type: "string",
              description:
                "Optional: Working directory for the command (defaults to current directory)",
            },
          },
          required: ["command"],
        },
        async (args: { command: string; cwd?: string }) => {
          const cwd = args.cwd || process.cwd();
          const result = await executeBash(args.command, cwd, timeoutMs);
          const { output, truncated } = truncateOutput(
            result.stdout,
            result.stderr,
            maxBytes,
            maxLines,
          );

          let finalOutput = output;
          if (result.exitCode !== null && result.exitCode !== 0) {
            finalOutput = `[EXIT CODE: ${result.exitCode}]\n` + finalOutput;
          }
          if (truncated) {
            finalOutput += `\n\n[Note: Output was truncated]`;
          }

          return {
            content: [{ type: "text", text: finalOutput }],
            isError: result.exitCode !== null && result.exitCode !== 0,
          };
        },
        { internal: true },
      );
    },
  };
}

/**
 * Factory function for parameterized usage via string path
 *
 * Supports query parameters:
 * - maxBytes: Maximum output bytes (default: 100000)
 * - maxLines: Maximum output lines (default: 2000)
 * - timeout: Timeout in seconds (default: 60)
 *
 * @example
 * ```ts
 * plugins: ["@mcpc/core/plugins/bash?maxBytes=50000&timeout=30"]
 * ```
 */
export function createPlugin(params: Record<string, string>): ToolPlugin {
  const options: BashPluginOptions = {};

  if (params.maxBytes) {
    const parsed = parseInt(params.maxBytes, 10);
    if (!isNaN(parsed)) options.maxBytes = parsed;
  }

  if (params.maxLines) {
    const parsed = parseInt(params.maxLines, 10);
    if (!isNaN(parsed)) options.maxLines = parsed;
  }

  if (params.timeout) {
    const parsed = parseInt(params.timeout, 10);
    if (!isNaN(parsed)) options.timeoutMs = parsed * 1000;
  }

  return createBashPlugin(options);
}

export default createBashPlugin;
