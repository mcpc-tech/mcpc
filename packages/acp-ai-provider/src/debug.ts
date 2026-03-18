import type { SessionNotification } from "@agentclientprotocol/sdk";
import { appendFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

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
    this.ensureAgentMessageLogFile();
    if (!this.agentMessageLogFilePath) {
      return;
    }

    try {
      appendFileSync(
        this.agentMessageLogFilePath,
        `${
          JSON.stringify({
            timestamp: new Date().toISOString(),
            notification,
          })
        }\n`,
      );
    } catch {
      // Best-effort debug logging only.
    }
  }
}
