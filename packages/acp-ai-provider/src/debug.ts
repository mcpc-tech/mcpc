import type { SessionNotification } from "@agentclientprotocol/sdk";
import { appendFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

type ACPDebugLogEntry = {
  timestamp: string;
  kind: "notification" | "prompt-response" | "prompt-error";
  notification?: SessionNotification;
  response?: unknown;
  error?: unknown;
};

export class ACPDebugLogger {
  private agentMessageLogFilePath: string | null = null;

  isEnabled(): boolean {
    const value = process.env.ACP_AI_PROVIDER_DEBUG;
    return value === "1" || value === "true";
  }

  log(...args: unknown[]): void {
    if (!this.isEnabled()) {
      return;
    }
    // eslint-disable-next-line no-console
    console.log(...args);
  }

  ensureAgentMessageLogFile(): void {
    if (this.agentMessageLogFilePath || !this.isEnabled()) {
      return;
    }

    const debugDir = mkdtempSync(join(tmpdir(), "acp-ai-provider-"));
    this.agentMessageLogFilePath = join(debugDir, "agent-messages.ndjson");
    this.log(
      `[acp-ai-provider] Agent message log: ${this.agentMessageLogFilePath}`,
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
