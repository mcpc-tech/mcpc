/**
 * MCP Logging Utility
 *
 * Provides a centralized logging interface that always logs to console
 * and additionally sends MCP notifications when a server instance is available.
 *
 * Logging levels according to MCP spec:
 * - debug, info, notice, warning, error, critical, alert, emergency
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

export interface LogMessage {
  level: LogLevel;
  logger?: string;
  data: unknown;
}

/**
 * Logger class that always logs to console and optionally sends MCP notifications
 */
export class MCPLogger {
  private server?: Server;
  private loggerName: string;

  constructor(loggerName: string = "mcpc", server?: Server) {
    this.loggerName = loggerName;
    this.server = server;
  }

  /**
   * Set the server instance for sending notifications
   */
  setServer(server: Server): void {
    this.server = server;
  }

  /**
   * Send a log message via MCP notification AND console
   */
  private async log(level: LogLevel, data: unknown): Promise<void> {
    // Always log to console
    this.logToConsole(level, data);

    // Also send MCP notification if server is available
    if (this.server) {
      try {
        await this.server.notification({
          method: "notifications/message",
          params: {
            level,
            logger: this.loggerName,
            data,
          },
        });
      } catch (error) {
        // Silently ignore MCP notification failures
        // (console logging already happened above)
      }
    }
  }

  /**
   * Fallback to console logging
   */
  private logToConsole(level: LogLevel, data: unknown): void {
    const prefix = `[${this.loggerName}]`;
    const message = typeof data === "string" ? data : JSON.stringify(data);

    switch (level) {
      case "debug":
        console.debug(prefix, message);
        break;
      case "info":
      case "notice":
        console.info(prefix, message);
        break;
      case "warning":
        console.warn(prefix, message);
        break;
      case "error":
      case "critical":
      case "alert":
      case "emergency":
        console.error(prefix, message);
        break;
      default:
        console.log(prefix, message);
    }
  }

  /**
   * Convenience methods for each log level
   */
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

  /**
   * Create a child logger with a specific name
   */
  child(name: string): MCPLogger {
    return new MCPLogger(`${this.loggerName}.${name}`, this.server);
  }
}

/**
 * Global logger instance - can be configured with a server
 */
export const logger = new MCPLogger("mcpc");

/**
 * Create a logger for a specific component
 */
export function createLogger(name: string, server?: Server): MCPLogger {
  return new MCPLogger(name, server);
}
