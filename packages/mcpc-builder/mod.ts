/**
 * MCPC Builder - MCP Server for discovering and composing MCP configurations
 *
 * This server exposes the mcpc.tech registry as MCP tools, allowing AI assistants
 * to search for servers, get details, and compose configurations programmatically.
 */

// Export server creation and components
export { createServer } from "./src/server.ts";
export { handleToolCall } from "./src/handlers.ts";
export { toolDefinitions } from "./src/tools.ts";
export * from "./src/schemas.ts";
export * from "./src/types.ts";
export { registryClient } from "./src/registry-client.ts";
export { configBuilder } from "./src/config-builder.ts";
