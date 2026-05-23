/**
 * plugin-bash-exec — real bash / CLI execution via secure-exec policy mediation
 *
 * Features:
 *   - Runs real host CLI tools through secure-exec's child-process bridge
 *   - Concurrency limiting (semaphore)
 *   - Per-call timeout enforcement
 *   - Policy checks over command, args, cwd, and env
 *   - Output truncation (bytes + lines)
 */

import path from "node:path";
import process from "node:process";
import type { ComposeStartContext, ToolPlugin } from "@mcpc/core";

export type CliEnvMode = "inherit" | "empty" | "allowlist";

export interface CliPolicyOptions {
  allowCommands?: string[];
  denyCommands?: string[];
  allowArgs?: Record<string, string[][]>;
  denyArgs?: Record<string, string[][]>;
  allowCwdPrefixes?: string[];
  envMode?: CliEnvMode;
  envAllowlist?: string[];
}

export interface BashExecPluginOptions extends CliPolicyOptions {
  env?: Record<string, string>;
  timeoutMs?: number;
  concurrency?: number;
  maxBytes?: number;
  maxLines?: number;
  defaultCwd?: string;
  shellBinary?: string;
  shellArgs?: string[];
}

interface ResolvedExecution {
  binary: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

const DEFAULTS = {
  env: {} as Record<string, string>,
  timeoutMs: 10_000,
  concurrency: 4,
  maxBytes: 50_000,
  maxLines: 1_000,
  defaultCwd: "",
  shellBinary: "bash",
  shellArgs: ["-c"],
  envMode: "inherit" as CliEnvMode,
};

function createSemaphore(limit: number) {
  limit = Math.max(limit, 1);
  let active = 0;
  const queue: Array<() => void> = [];
  return async function acquire<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      await new Promise<void>((r) => queue.push(r));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

function truncate(text: string, maxBytes: number, maxLines: number): string {
  const lines = text.split("\n");
  if (lines.length > maxLines) {
    return (
      `[TRUNCATED] last ${maxLines} of ${lines.length} lines\n\n` +
      lines.slice(-maxLines).join("\n")
    );
  }
  if (text.length > maxBytes) {
    return (
      `[TRUNCATED] last ${maxBytes} of ${text.length} bytes\n\n` +
      text.slice(-maxBytes)
    );
  }
  return text;
}

function matchesCommand(command: string, pattern: string): boolean {
  if (pattern.includes("/")) {
    return command === pattern;
  }
  // pattern is bare name: only match bare command (no path separator)
  return command === pattern;
}

function collectArgPatterns(
  rules: Record<string, string[][]> | undefined,
  command: string,
): string[][] {
  if (!rules) return [];
  return Object.entries(rules)
    .filter(([key]) => matchesCommand(command, key))
    .flatMap(([, patterns]) => patterns);
}

function matchesArgPattern(args: string[], pattern: string[]): boolean {
  if (pattern.length !== args.length) return false;
  return pattern.every((value, index) => args[index] === value);
}

function isWithinPrefix(target: string, prefix: string): boolean {
  const resolvedTarget = path.resolve(target);
  const resolvedPrefix = path.resolve(prefix);
  return resolvedTarget === resolvedPrefix ||
    resolvedTarget.startsWith(`${resolvedPrefix}${path.sep}`);
}

function evaluateCliPolicy(
  binary: string,
  args: string[],
  cwd: string,
  policy: CliPolicyOptions,
): string | null {
  if (policy.denyCommands?.some((pattern) => matchesCommand(binary, pattern))) {
    return `Command denied by policy: ${binary}`;
  }

  if (
    policy.allowCommands?.length &&
    !policy.allowCommands.some((pattern) => matchesCommand(binary, pattern))
  ) {
    return `Command not allowed by policy: ${binary}`;
  }

  if (
    policy.allowCwdPrefixes?.length &&
    !policy.allowCwdPrefixes.some((prefix) => isWithinPrefix(cwd, prefix))
  ) {
    return `Working directory not allowed by policy: ${cwd}`;
  }

  const denyPatterns = collectArgPatterns(policy.denyArgs, binary);
  if (denyPatterns.some((pattern) => matchesArgPattern(args, pattern))) {
    return `Arguments denied by policy for command: ${binary}`;
  }

  const allowPatterns = collectArgPatterns(policy.allowArgs, binary);
  if (
    allowPatterns.length > 0 &&
    !allowPatterns.some((pattern) => matchesArgPattern(args, pattern))
  ) {
    return `Arguments not allowed by policy for command: ${binary}`;
  }

  return null;
}

function buildEnv(
  injectedEnv: Record<string, string>,
  policy: CliPolicyOptions,
): Record<string, string> {
  const hostEnv: Record<string, string> = {};
  for (
    const [k, v] of Object.entries(
      Deno.env.toObject() as Record<string, string | undefined>,
    )
  ) {
    if (v != null) hostEnv[k] = v;
  }

  let baseEnv: Record<string, string>;
  switch (policy.envMode ?? "inherit") {
    case "empty":
      baseEnv = {};
      break;
    case "allowlist":
      baseEnv = Object.fromEntries(
        (policy.envAllowlist ?? [])
          .filter((key) => key in hostEnv)
          .map((key) => [key, hostEnv[key] ?? ""]),
      );
      break;
    case "inherit":
    default:
      baseEnv = hostEnv;
      break;
  }

  return { ...baseEnv, ...injectedEnv };
}

function resolveExecution(
  args: { command?: string; binary?: string; args?: string[]; cwd?: string },
  cfg: BashExecPluginOptions,
): ResolvedExecution | { error: string } {
  const cwd = args.cwd ?? cfg.defaultCwd ?? process.cwd();
  const env = buildEnv(cfg.env ?? {}, cfg);

  if (args.binary) {
    return {
      binary: args.binary,
      args: args.args ?? [],
      cwd,
      env,
    };
  }

  if (args.command) {
    return {
      binary: cfg.shellBinary ?? "bash",
      args: [...(cfg.shellArgs ?? ["-c"]), args.command],
      cwd,
      env,
    };
  }

  return { error: "Provide either `command` or `binary`." };
}

function buildRunnerScript(
  execution: ResolvedExecution,
  timeoutMs: number,
): string {
  return `
const { spawn } = require("node:child_process");
const binary = ${JSON.stringify(execution.binary)};
const args = ${JSON.stringify(execution.args)};
const cwd = ${JSON.stringify(execution.cwd)};
const env = ${JSON.stringify(execution.env)};
const timeoutMs = ${JSON.stringify(timeoutMs)};

const child = spawn(binary, args, {
  cwd,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});

let finished = false;
const timer = setTimeout(() => {
  if (finished) return;
  child.kill("SIGTERM");
  process.stderr.write("[TIMEOUT] Command exceeded " + timeoutMs + "ms\\n");
}, timeoutMs);

child.stdout.on("data", (data) => process.stdout.write(data));
child.stderr.on("data", (data) => process.stderr.write(data));

child.on("error", (err) => {
  finished = true;
  clearTimeout(timer);
  process.stderr.write(String(err?.message ?? err));
  process.exit(1);
});

child.on("close", (code, signal) => {
  finished = true;
  clearTimeout(timer);
  if (signal) {
    process.exit(124);
  }
  process.exit(code ?? 0);
});
`;
}

async function runSecureCli(
  execution: ResolvedExecution,
  cfg: BashExecPluginOptions,
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  errorMessage: string;
  timedOut: boolean;
}> {
  const {
    NodeRuntime,
    createNodeDriver,
    createNodeRuntimeDriverFactory,
    createInMemoryFileSystem,
    createNodeHostCommandExecutor,
    allowAllFs,
    // deno-lint-ignore no-explicit-any
  } = await import("secure-exec") as any;

  const stdout: string[] = [];
  const stderr: string[] = [];
  let fallbackTimedOut = false;
  const timeoutMs = cfg.timeoutMs ?? DEFAULTS.timeoutMs;

  const runtime = new NodeRuntime({
    systemDriver: createNodeDriver({
      filesystem: createInMemoryFileSystem(),
      commandExecutor: createNodeHostCommandExecutor(),
      permissions: {
        ...allowAllFs,
        childProcess: (
          request: { command: string; args: string[]; cwd?: string },
        ) => {
          const reason = evaluateCliPolicy(
            request.command,
            request.args,
            request.cwd ?? execution.cwd,
            cfg,
          );
          return reason ? { allow: false, reason } : { allow: true };
        },
      },
      processConfig: { cwd: execution.cwd },
    }),
    runtimeDriverFactory: createNodeRuntimeDriverFactory(),
    onStdio: (event: { channel: string; message: string }) => {
      if (event.channel === "stdout") stdout.push(event.message);
      else stderr.push(event.message);
    },
  });

  const fallbackTimer = setTimeout(() => {
    fallbackTimedOut = true;
    runtime.terminate?.();
  }, timeoutMs + 1_000);

  try {
    const result = await runtime.exec(
      buildRunnerScript(execution, timeoutMs),
    );
    const stderrText = stderr.join("");
    return {
      stdout: stdout.join(""),
      stderr: stderrText,
      exitCode: result.code ?? 0,
      errorMessage: result.errorMessage ?? "",
      timedOut: fallbackTimedOut || stderrText.includes("[TIMEOUT]"),
    };
  } catch (err) {
    return {
      stdout: stdout.join(""),
      stderr: stderr.join(""),
      exitCode: null,
      errorMessage: err instanceof Error ? err.message : String(err),
      timedOut: fallbackTimedOut,
    };
  } finally {
    clearTimeout(fallbackTimer);
    await runtime.terminate?.();
  }
}

export function createBashExecPlugin(
  options: BashExecPluginOptions = {},
): ToolPlugin {
  const cfg = { ...DEFAULTS, ...options };
  if (!cfg.defaultCwd) {
    cfg.defaultCwd = process.cwd();
  }

  const semaphore = createSemaphore(cfg.concurrency);
  // deno-lint-ignore no-explicit-any
  let serverRef: any = null;

  return {
    name: "plugin-bash-exec",
    version: "0.0.1",

    configureServer(server) {
      serverRef = server;
    },

    composeStart(context: ComposeStartContext) {
      if (!serverRef) return;

      const toolName = `${context.serverName}__bash_exec`;

      serverRef.tool(
        toolName,
        "Execute a real bash command or CLI binary through secure-exec policy mediation.\n\n" +
          "Modes:\n" +
          "- command: runs through the configured shell binary\n" +
          "- binary + args: direct CLI execution with policy checks",
        {
          type: "object",
          properties: {
            command: {
              type: "string",
              description:
                "Shell command to run through the configured shell binary",
            },
            binary: {
              type: "string",
              description: "Real CLI binary to execute directly",
            },
            args: {
              type: "array",
              items: { type: "string" },
              description: "Arguments for direct CLI execution",
            },
            cwd: {
              type: "string",
              description: "Working directory for the command or binary",
            },
          },
        } as const,
        (
          args: {
            command?: string;
            binary?: string;
            args?: string[];
            cwd?: string;
          },
        ) => {
          return semaphore(async () => {
            const resolved = resolveExecution(args, cfg);
            if ("error" in resolved) {
              return {
                content: [{
                  type: "text" as const,
                  text: `[ERROR] ${resolved.error}`,
                }],
                isError: true,
              };
            }

            const policyError = evaluateCliPolicy(
              resolved.binary,
              resolved.args,
              resolved.cwd,
              cfg,
            );
            if (policyError) {
              return {
                content: [{
                  type: "text" as const,
                  text: `[DENIED] ${policyError}`,
                }],
                isError: true,
              };
            }

            const result = await runSecureCli(resolved, cfg);
            const combined =
              (result.stderr ? `STDERR:\n${result.stderr}\n\nSTDOUT:\n` : "") +
              result.stdout;

            let output = result.timedOut
              ? result.stderr.includes("[TIMEOUT]")
                ? result.stderr
                : `[TIMEOUT] Command exceeded ${cfg.timeoutMs}ms\n\n` +
                  truncate(combined, cfg.maxBytes, cfg.maxLines)
              : truncate(combined, cfg.maxBytes, cfg.maxLines);

            if (result.errorMessage) {
              output = `[ERROR] ${result.errorMessage}\n\n` + output;
            } else if (
              !result.timedOut && result.exitCode !== 0 &&
              result.exitCode != null
            ) {
              output = `[EXIT CODE: ${result.exitCode}]\n` + output;
            }

            const isError = result.timedOut ||
              result.exitCode === null ||
              (result.exitCode !== null && result.exitCode !== 0) ||
              !!result.errorMessage;

            return {
              content: [{ type: "text" as const, text: output }],
              ...(isError ? { isError: true } : {}),
            };
          });
        },
        { internal: true },
      );
    },
  };
}

export function createPlugin(params: Record<string, string>): ToolPlugin {
  const opts: BashExecPluginOptions = {};
  if (params.timeoutMs) opts.timeoutMs = parseInt(params.timeoutMs, 10) || 0;
  if (params.concurrency) {
    opts.concurrency = parseInt(params.concurrency, 10) || 0;
  }
  if (params.maxBytes) opts.maxBytes = parseInt(params.maxBytes, 10) || 0;
  if (params.maxLines) opts.maxLines = parseInt(params.maxLines, 10) || 0;
  if (params.defaultCwd) opts.defaultCwd = params.defaultCwd;
  if (params.shellBinary) opts.shellBinary = params.shellBinary;
  if (params.shellArgs) {
    opts.shellArgs = params.shellArgs.split(",").filter(Boolean);
  }
  if (params.envMode) opts.envMode = params.envMode as CliEnvMode;
  if (params.allowCommands) {
    opts.allowCommands = params.allowCommands.split(",").filter(Boolean);
  }
  if (params.denyCommands) {
    opts.denyCommands = params.denyCommands.split(",").filter(Boolean);
  }
  if (params.allowCwdPrefixes) {
    opts.allowCwdPrefixes = params.allowCwdPrefixes.split(",").filter(Boolean);
  }
  if (params.envAllowlist) {
    opts.envAllowlist = params.envAllowlist.split(",").filter(Boolean);
  }
  return createBashExecPlugin(opts);
}

export default createBashExecPlugin;
