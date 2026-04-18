/**
 * MCP Logging Utility
 *
 * Provides a centralized logging interface that always logs to console
 * and additionally sends MCP notifications when a server instance is available.
 *
 * Logging levels according to MCP spec:
 * - debug, info, notice, warning, error, critical, alert, emergency
 *
 * Silent mode has two layers:
 * - **Global** (`setSilent(true)`): suppresses console output for ALL loggers
 * - **Per-instance** (`logger.silent = true`): suppresses console output for ONE logger only
 * - MCP protocol logging (`sendLoggingMessage`) always works regardless of silent mode.
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

export type LogLevel =
  | "debug"
  | "info"
  | "notice"
  | "warning"
  | "error"
  | "critical"
  | "alert"
  | "emergency";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  notice: 2,
  warning: 3,
  error: 4,
  critical: 5,
  alert: 6,
  emergency: 7,
};

/** Global silent flag — when true, ALL loggers suppress console output. */
let globalSilent = false;

/**
 * Set the global silent mode for all loggers.
 * When true, console output is suppressed for every MCPLogger instance,
 * but MCP protocol logging still works.
 */
export function setSilent(silent: boolean): void {
  globalSilent = silent;
}

/**
 * Get the current global silent mode.
 */
export function isSilent(): boolean {
  return globalSilent;
}

export class MCPLogger {
  private server?: Server;
  private loggerName: string;
  private minLevel: LogLevel = "debug";
  private _silent: boolean = false;

  constructor(loggerName: string = "mcpc", server?: Server) {
    this.loggerName = loggerName;
    this.server = server;
  }

  /**
   * Per-instance silent flag. When true, console output is suppressed
   * for this logger only.
   *
   * To suppress ALL loggers at once, use `setSilent(true)` instead.
   *
   * MCP protocol logging (`sendLoggingMessage`) still works regardless.
   */
  get silent(): boolean {
    return this._silent;
  }

  set silent(value: boolean) {
    this._silent = value;
  }

  setServer(server: Server): void {
    this.server = server;
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  getLevel(): LogLevel {
    return this.minLevel;
  }

  private async log(level: LogLevel, data: unknown): Promise<void> {
    // Filter by minimum level
    if (LOG_LEVELS[level] < LOG_LEVELS[this.minLevel]) {
      return;
    }

    // Log to console unless this instance OR global silent mode is enabled
    if (!this._silent && !globalSilent) {
      this.logToConsole(level, data);
    }

    // Also send to MCP server if available
    if (this.server) {
      try {
        await this.server.sendLoggingMessage({
          level,
          logger: this.loggerName,
          data,
        });
      } catch {
        // Ignore MCP failures
      }
    }
  }

  private logToConsole(level: LogLevel, data: unknown): void {
    const message = typeof data === "string" ? data : JSON.stringify(data);
    const prefix = `[${this.loggerName}:${level}]`;

    // Always use console.error to avoid interfering with JSON-RPC on stdout in stdio mode
    console.error(prefix, message);
  }

  debug(data: unknown): Promise<void> {
    return this.log("debug", data);
  }

  info(data: unknown): Promise<void> {
    return this.log("info", data);
  }

  notice(data: unknown): Promise<void> {
    return this.log("notice", data);
  }

  warning(data: unknown): Promise<void> {
    return this.log("warning", data);
  }

  error(data: unknown): Promise<void> {
    return this.log("error", data);
  }

  critical(data: unknown): Promise<void> {
    return this.log("critical", data);
  }

  alert(data: unknown): Promise<void> {
    return this.log("alert", data);
  }

  emergency(data: unknown): Promise<void> {
    return this.log("emergency", data);
  }

  child(name: string): MCPLogger {
    const child = new MCPLogger(`${this.loggerName}.${name}`, this.server);
    child.setLevel(this.minLevel);
    child.silent = this._silent;
    return child;
  }
}

export const logger: MCPLogger = new MCPLogger("mcpc");

export function createLogger(name: string, server?: Server): MCPLogger {
  return new MCPLogger(name, server);
}
