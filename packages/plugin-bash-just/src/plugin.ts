/**
 * plugin-bash-just — sandboxed bash execution via just-bash
 *
 * Three filesystem modes:
 *   - "memory"    (default) — pure in-memory FS, zero host access
 *   - "overlay"   — reads from rootDir, writes stay in memory (copy-on-write)
 *   - "readwrite" — full read/write scoped under rootDir
 *
 * Features:
 *   - Concurrency limiting (semaphore)
 *   - Per-call timeout via AbortController
 *   - Explicit env injection (no process.env leakage)
 *   - Execution limits (max commands, loop iterations, call depth)
 *   - Output truncation (bytes + lines)
 *   - Optional real CLI execution under policy control
 */

import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";
import type { ComposeStartContext, ToolPlugin } from "@mcpc/core";
import type { Buffer } from "node:buffer";

export type FsMode = "memory" | "overlay" | "readwrite";
export type CliEnvMode = "inherit" | "empty" | "allowlist";

export interface SandboxResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

export interface CliExecutionRequest {
  binary: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  signal: AbortSignal;
}

export interface CliExecutionResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
}

export type SandboxFn = (
  command: string,
  options: { cwd: string; env: Record<string, string>; signal: AbortSignal },
) => Promise<SandboxResult>;

export type CliExecutor = (
  request: CliExecutionRequest,
) => Promise<CliExecutionResult>;

export interface CliPolicyOptions {
  allowCommands?: string[];
  denyCommands?: string[];
  allowArgs?: Record<string, string[][]>;
  denyArgs?: Record<string, string[][]>;
  allowCwdPrefixes?: string[];
  envMode?: CliEnvMode;
  envAllowlist?: string[];
}

export interface BashJustCliOptions extends CliPolicyOptions {
  enabled?: boolean;
  defaultCwd?: string;
  executor?: CliExecutor;
}

export interface BashJustPluginOptions {
  fsMode?: FsMode;
  rootDir?: string;
  initialFiles?: Record<string, string>;
  env?: Record<string, string>;
  timeoutMs?: number;
  concurrency?: number;
  maxBytes?: number;
  maxLines?: number;
  maxCommandCount?: number;
  maxLoopIterations?: number;
  maxCallDepth?: number;
  sandbox?: SandboxFn;
  cli?: BashJustCliOptions;
}

const DEFAULTS = {
  fsMode: "memory" as FsMode,
  rootDir: "",
  initialFiles: {} as Record<string, string>,
  env: { PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8" } as Record<
    string,
    string
  >,
  timeoutMs: 30_000,
  concurrency: 4,
  maxBytes: 100_000,
  maxLines: 2_000,
  maxCommandCount: 500,
  maxLoopIterations: 10_000,
  maxCallDepth: 50,
  cli: {
    enabled: false,
    envMode: "empty" as CliEnvMode,
  } as BashJustCliOptions,
};

function createSemaphore(limit: number) {
  limit = Math.max(limit, 1);
  let active = 0;
  const queue: Array<() => void> = [];

  return async function acquire<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      await new Promise<void>((resolve) => queue.push(resolve));
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

function truncateOutput(
  text: string,
  maxBytes: number,
  maxLines: number,
): string {
  const lines = text.split("\n");
  if (lines.length > maxLines) {
    return (
      `[TRUNCATED] showing last ${maxLines} of ${lines.length} lines\n\n` +
      lines.slice(-maxLines).join("\n")
    );
  }
  if (text.length > maxBytes) {
    return (
      `[TRUNCATED] showing last ${maxBytes} bytes of ${text.length}\n\n` +
      text.slice(-maxBytes)
    );
  }
  return text;
}

function matchesCommand(command: string, pattern: string): boolean {
  if (pattern.includes("/")) {
    return command === pattern;
  }
  // pattern is a bare name: only match bare command (no path separator)
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

function buildCliEnv(
  injectedEnv: Record<string, string>,
  policy: CliPolicyOptions,
): Record<string, string> {
  const hostEnv: Record<string, string> = {};
  for (
    const [k, v] of Object.entries(
      process.env as Record<string, string | undefined>,
    )
  ) {
    if (v != null) hostEnv[k] = v;
  }

  let baseEnv: Record<string, string>;
  switch (policy.envMode ?? "empty") {
    case "inherit":
      baseEnv = hostEnv;
      break;
    case "allowlist":
      baseEnv = Object.fromEntries(
        (policy.envAllowlist ?? [])
          .filter((key) => key in hostEnv)
          .map((key) => [key, hostEnv[key] ?? ""]),
      );
      break;
    case "empty":
    default:
      baseEnv = {};
      break;
  }

  return { ...baseEnv, ...injectedEnv };
}

function runHostCli(
  request: CliExecutionRequest,
): Promise<CliExecutionResult> {
  const child = spawn(request.binary, request.args, {
    cwd: request.cwd,
    env: { ...request.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let timedOut = false;

  child.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const onAbort = () => {
    timedOut = true;
    try {
      child.kill("SIGTERM");
    } catch {
      // process may already be gone
    }
  };
  request.signal.addEventListener("abort", onAbort, { once: true });

  return new Promise<CliExecutionResult>((resolve) => {
    child.on("close", (code: number | null) => {
      request.signal.removeEventListener("abort", onAbort);
      if (timedOut || request.signal.aborted) {
        resolve({
          stdout,
          stderr: stderr
            ? `${stderr}
[TIMEOUT] Command exceeded execution deadline`
            : "[TIMEOUT] Command exceeded execution deadline",
          exitCode: null,
        });
      } else {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 1,
        });
      }
    });

    child.on("error", (err: Error) => {
      request.signal.removeEventListener("abort", onAbort);
      resolve({
        stdout: "",
        stderr: `[ERROR] ${err.message}`,
        exitCode: null,
      });
    });
  });
}

function buildOutput(
  stdout: string | undefined,
  stderr: string | undefined,
  exitCode: number | null | undefined,
  maxBytes: number,
  maxLines: number,
): { text: string; isError?: true } {
  const rawOutput = (stderr ? `STDERR:\n${stderr}\n\nSTDOUT:\n` : "") +
    (stdout ?? "");
  let output = truncateOutput(rawOutput, maxBytes, maxLines);
  if (exitCode !== 0 && exitCode != null) {
    output = `[EXIT CODE: ${exitCode}]\n` + output;
  }
  const isError = exitCode == null || exitCode !== 0;
  return {
    text: output,
    ...(isError ? { isError: true as const } : {}),
  };
}

export function createBashJustPlugin(
  options: BashJustPluginOptions = {},
): ToolPlugin {
  const cfg = {
    ...DEFAULTS,
    ...options,
    cli: {
      ...DEFAULTS.cli,
      ...options.cli,
    },
  };

  if (!cfg.rootDir) {
    cfg.rootDir = process.cwd();
  }

  const semaphore = createSemaphore(cfg.concurrency);
  // deno-lint-ignore no-explicit-any
  let serverRef: any = null;

  return {
    name: "plugin-bash-just",
    version: "0.0.1",

    configureServer(server) {
      serverRef = server;
    },

    composeStart(context: ComposeStartContext) {
      if (!serverRef) return;

      const toolName = `${context.serverName}__bash_just`;

      serverRef.tool(
        toolName,
        "Execute bash via just-bash, or run an approved real CLI under policy control.\n\n" +
          "Modes:\n" +
          "- command: interpreted by just-bash by default\n" +
          "- binary + args: real CLI execution when CLI mode is enabled",
        {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "Bash command(s) to execute with just-bash",
            },
            binary: {
              type: "string",
              description:
                "Real CLI binary to execute when CLI mode is enabled",
            },
            args: {
              type: "array",
              items: { type: "string" },
              description: "Arguments for the real CLI binary",
            },
            cwd: {
              type: "string",
              description: "Working directory for the execution",
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
            if (!args.command && !args.binary) {
              return {
                content: [{
                  type: "text" as const,
                  text: "[ERROR] Provide either `command` or `binary`.",
                }],
                isError: true,
              };
            }

            if (args.binary) {
              if (!cfg.cli.enabled) {
                return {
                  content: [{
                    type: "text" as const,
                    text:
                      "[ERROR] Real CLI execution is not enabled for this plugin instance.",
                  }],
                  isError: true,
                };
              }

              const cwd = args.cwd ?? cfg.cli.defaultCwd ?? process.cwd();
              const cliArgs = args.args ?? [];
              const policyError = evaluateCliPolicy(
                args.binary,
                cliArgs,
                cwd,
                cfg.cli,
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

              const ac = new AbortController();
              const timer = setTimeout(() => ac.abort(), cfg.timeoutMs);
              try {
                const executor = cfg.cli.executor ?? runHostCli;
                const result = await executor({
                  binary: args.binary,
                  args: cliArgs,
                  cwd,
                  env: buildCliEnv(cfg.env, cfg.cli),
                  signal: ac.signal,
                });
                clearTimeout(timer);

                const output = buildOutput(
                  result.stdout,
                  result.stderr,
                  result.exitCode,
                  cfg.maxBytes,
                  cfg.maxLines,
                );
                return {
                  content: [{ type: "text" as const, text: output.text }],
                  ...(output.isError ? { isError: true } : {}),
                };
              } catch (err) {
                clearTimeout(timer);
                const isTimeout = err instanceof Error &&
                  err.name === "AbortError";
                const msg = isTimeout
                  ? `[TIMEOUT] Command exceeded ${cfg.timeoutMs}ms`
                  : `[ERROR] ${
                    err instanceof Error ? err.message : String(err)
                  }`;
                return {
                  content: [{ type: "text" as const, text: msg }],
                  isError: true,
                };
              }
            }

            const {
              Bash,
              InMemoryFs,
              OverlayFs,
              ReadWriteFs,
              // deno-lint-ignore no-explicit-any
            } = await import("just-bash") as any;

            let fs: unknown;
            if (cfg.fsMode === "overlay") {
              fs = new OverlayFs({ root: cfg.rootDir, mountPoint: "/" });
            } else if (cfg.fsMode === "readwrite") {
              fs = new ReadWriteFs({ root: cfg.rootDir });
            } else {
              const memFs = new InMemoryFs();
              for (
                const [filePath, content] of Object.entries(cfg.initialFiles)
              ) {
                await memFs.writeFile(
                  filePath,
                  new TextEncoder().encode(content),
                );
              }
              fs = memFs;
            }

            const bash = new Bash({
              fs,
              env: cfg.env,
              network: false,
              defenseInDepth: false,
              limits: {
                maxCommandCount: cfg.maxCommandCount,
                maxLoopIterations: cfg.maxLoopIterations,
                maxCallDepth: cfg.maxCallDepth,
              },
            });

            const ac = new AbortController();
            const timer = setTimeout(() => ac.abort(), cfg.timeoutMs);

            try {
              if (cfg.sandbox) {
                const sandboxResult = await cfg.sandbox(args.command!, {
                  cwd: args.cwd ?? "/home/user",
                  env: cfg.env,
                  signal: ac.signal,
                });
                clearTimeout(timer);
                const output = buildOutput(
                  sandboxResult.stdout,
                  sandboxResult.stderr,
                  sandboxResult.exitCode,
                  cfg.maxBytes,
                  cfg.maxLines,
                );
                return {
                  content: [{ type: "text" as const, text: output.text }],
                  ...(output.isError ? { isError: true } : {}),
                };
              }

              const result = await bash.exec(args.command!, {
                cwd: args.cwd ?? "/home/user",
                signal: ac.signal,
              });
              clearTimeout(timer);

              const output = buildOutput(
                result.stdout,
                result.stderr,
                result.exitCode,
                cfg.maxBytes,
                cfg.maxLines,
              );
              return {
                content: [{ type: "text" as const, text: output.text }],
                ...(output.isError ? { isError: true } : {}),
              };
            } catch (err) {
              clearTimeout(timer);
              const isTimeout = err instanceof Error &&
                err.name === "AbortError";
              const msg = isTimeout
                ? `[TIMEOUT] Command exceeded ${cfg.timeoutMs}ms`
                : `[ERROR] ${err instanceof Error ? err.message : String(err)}`;
              return {
                content: [{ type: "text" as const, text: msg }],
                isError: true,
              };
            }
          });
        },
        { internal: true },
      );
    },
  };
}

export function createPlugin(params: Record<string, string>): ToolPlugin {
  const opts: BashJustPluginOptions = {};

  if (params.fsMode) opts.fsMode = params.fsMode as FsMode;
  if (params.rootDir) opts.rootDir = params.rootDir;
  if (params.timeoutMs) opts.timeoutMs = parseInt(params.timeoutMs, 10) || 0;
  if (params.concurrency) {
    opts.concurrency = parseInt(params.concurrency, 10) || 0;
  }
  if (params.maxBytes) opts.maxBytes = parseInt(params.maxBytes, 10) || 0;
  if (params.maxLines) opts.maxLines = parseInt(params.maxLines, 10) || 0;
  if (params.maxCommandCount) {
    opts.maxCommandCount = parseInt(params.maxCommandCount, 10) || 0;
  }
  if (params.maxLoopIterations) {
    opts.maxLoopIterations = parseInt(params.maxLoopIterations, 10) || 0;
  }
  if (params.cliEnabled) {
    opts.cli = {
      ...(opts.cli ?? {}),
      enabled: params.cliEnabled === "true",
    };
  }
  if (params.cliDefaultCwd) {
    opts.cli = {
      ...(opts.cli ?? {}),
      defaultCwd: params.cliDefaultCwd,
    };
  }
  if (params.cliEnvMode) {
    opts.cli = {
      ...(opts.cli ?? {}),
      envMode: params.cliEnvMode as CliEnvMode,
    };
  }
  if (params.cliAllowCommands) {
    opts.cli = {
      ...(opts.cli ?? {}),
      allowCommands: params.cliAllowCommands.split(",").filter(Boolean),
    };
  }
  if (params.cliDenyCommands) {
    opts.cli = {
      ...(opts.cli ?? {}),
      denyCommands: params.cliDenyCommands.split(",").filter(Boolean),
    };
  }
  if (params.cliAllowCwdPrefixes) {
    opts.cli = {
      ...(opts.cli ?? {}),
      allowCwdPrefixes: params.cliAllowCwdPrefixes.split(",").filter(Boolean),
    };
  }
  if (params.cliEnvAllowlist) {
    opts.cli = {
      ...(opts.cli ?? {}),
      envAllowlist: params.cliEnvAllowlist.split(",").filter(Boolean),
    };
  }

  return createBashJustPlugin(opts);
}

export default createBashJustPlugin;
