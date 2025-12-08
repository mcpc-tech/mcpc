/**
 * Tool Proxy Module
 *
 * Provides dynamic tool support for ACP AI Provider by bridging
 * AI SDK tools to ACP agents via a bidirectional stdio proxy.
 */

export { ToolProxyHost } from "./tool-proxy-host.ts";
export type { MCPServerConfig } from "./tool-proxy-host.ts";
export type { CallHandlerParams, ToolDefinition, ToolResult } from "./types.ts";
