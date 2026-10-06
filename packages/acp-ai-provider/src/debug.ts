/**
 * Lightweight debug logging (debug-js env convention, no dependency).
 *
 * Enable with:
 *   DEBUG=acp-ai-provider:*
 *   DEBUG=acp-ai-provider:auth
 *   DEBUG=acp-ai-provider:session,acp-ai-provider:stream
 *
 * Backward compatible: ACP_AI_PROVIDER_DEBUG=1|true enables `acp-ai-provider:*`
 * (merged with any existing DEBUG value).
 *
 * Namespaces write to stderr by default.
 */

import type { SessionNotification } from "@agentclientprotocol/sdk";
import { appendFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const ROOT = "acp-ai-provider";

export type DebugFn = ((formatter: string, ...args: unknown[]) => void) & {
  enabled: boolean;
  namespace: string;
};

function debugEnv(): string {
  const legacy = process.env.ACP_AI_PROVIDER_DEBUG?.trim().toLowerCase();
  const existing = process.env.DEBUG?.trim() ?? "";
  if (legacy === "1" || legacy === "true") {
    return existing ? `${existing},${ROOT}:*` : `${ROOT}:*`;
  }
  return existing;
}

/** Match debug-js style: comma-separated names, trailing `*` wildcards, `-` skips. */
function namespaceEnabled(namespace: string, env: string): boolean {
  if (!env) return false;
  let enabled = false;
  for (const raw of env.split(/[\s,]+/)) {
    const pattern = raw.trim();
    if (!pattern) continue;
    const skip = pattern.startsWith("-");
    const body = skip ? pattern.slice(1) : pattern;
    if (!body) continue;
    const re = new RegExp(
      `^${body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*?")}$`,
    );
    if (re.test(namespace)) {
      enabled = !skip;
    }
  }
  return enabled;
}

function formatArg(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatMessage(formatter: string, args: unknown[]): string {
  let i = 0;
  const out = formatter.replace(/%[sdOj%o%]/g, (token) => {
    if (token === "%%") return "%";
    const arg = args[i++];
    if (token === "%s" || token === "%d") return formatArg(arg);
    return formatArg(arg);
  });
  const rest = args.slice(i).map(formatArg);
  return rest.length ? `${out} ${rest.join(" ")}` : out;
}

function createNamespace(namespace: string): DebugFn {
  const enabled = namespaceEnabled(namespace, debugEnv());
  const log = ((formatter: string, ...args: unknown[]) => {
    if (!log.enabled) return;
    process.stderr.write(`${namespace} ${formatMessage(formatter, args)}\n`);
  }) as DebugFn;
  log.enabled = enabled;
  log.namespace = namespace;
  return log;
}

export const debugAuth = createNamespace(`${ROOT}:auth`);
export const debugSession = createNamespace(`${ROOT}:session`);
export const debugStream = createNamespace(`${ROOT}:stream`);
export const debugTranscript = createNamespace(`${ROOT}:transcript`);

type ACPDebugLogEntry = {
  timestamp: string;
  kind: "notification" | "prompt-response" | "prompt-error";
  notification?: SessionNotification;
  response?: unknown;
  error?: unknown;
};

/** True when transcript NDJSON writing should run (`acp-ai-provider:transcript` or `acp-ai-provider:*`). */
export function isTranscriptEnabled(): boolean {
  return debugTranscript.enabled;
}

/**
 * Holds the agent-message NDJSON transcript. Console tips use the exported
 * `debugAuth` / `debugSession` / `debugStream` loggers instead.
 */
export class ACPDebugLogger {
  private agentMessageLogFilePath: string | null = null;

  isEnabled(): boolean {
    return isTranscriptEnabled();
  }

  ensureAgentMessageLogFile(): void {
    if (this.agentMessageLogFilePath || !this.isEnabled()) {
      return;
    }

    const debugDir = mkdtempSync(join(tmpdir(), "acp-ai-provider-"));
    this.agentMessageLogFilePath = join(debugDir, "agent-messages.ndjson");
    debugTranscript(
      "Agent message log: %s",
      this.agentMessageLogFilePath,
    );
  }

  appendAgentMessage(notification: SessionNotification): void {
    this.appendLogEntry({
      timestamp: new Date().toISOString(),
      kind: "notification",
      notification,
    });
  }

  appendPromptResponse(response: unknown): void {
    this.appendLogEntry({
      timestamp: new Date().toISOString(),
      kind: "prompt-response",
      response,
    });
  }

  appendPromptError(error: unknown): void {
    this.appendLogEntry({
      timestamp: new Date().toISOString(),
      kind: "prompt-error",
      error: this.serializeError(error),
    });
  }

  private appendLogEntry(entry: ACPDebugLogEntry): void {
    this.ensureAgentMessageLogFile();
    if (!this.agentMessageLogFilePath) {
      return;
    }

    try {
      appendFileSync(
        this.agentMessageLogFilePath,
        `${JSON.stringify(entry)}\n`,
      );
    } catch {
      // Best-effort debug logging only.
    }
  }

  private serializeError(error: unknown): unknown {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(typeof (error as { code?: unknown }).code !== "undefined"
          ? { code: (error as { code?: unknown }).code }
          : {}),
        ...(typeof (error as { data?: unknown }).data !== "undefined"
          ? { data: (error as { data?: unknown }).data }
          : {}),
      };
    }
    return error;
  }
}
