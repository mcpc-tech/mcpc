/** MCPC Core - A library for building scalable agentic MCP servers.
 *
 * MCPC allows you to create composable MCP servers with one-prompt automation
 * workflow declaration, supporting thousands of dependent MCPs from the community.
 *
 * This module provides utilities for AI services, WeChat Work integration,
 * LLM providers (Ollama, Qwen), middleware, and MCP composition capabilities.
 *
 * ```ts
 * import { mcpc } from "@mcpc/core";
 * import { StdioServerTransport } from "@modelcontextprotocol/sdk";
 *
 * // Create a composable MCP server
 * const server = await mcpc(
 *   [
 *     { name: "my-agent", version: "1.0.0" },
 *     { capabilities: { tools: { listChanged: true } } }
 *   ],
 *   [
 *     {
 *       name: "file-organizer",
 *       description: "Automatically organize files in directories",
 *       deps: {
 *         mcpServers: {
 *           "@wonderwhy-er/desktop-commander": {
 *             command: "npx",
 *             args: ["-y", "@wonderwhy-er/desktop-commander@latest"]
 *           }
 *         }
 *       }
 *     }
 *   ]
 * );
 *
 * // Connect with stdio transport
 * const transport = new StdioServerTransport();
 * await server.connect(transport);
 * ```
 *
 *
 * @module
 */

export * from "./src/compose.ts";

export * from "./src/utils/common/env.ts";
export * from "./src/utils/common/ai.ts";
export * from "./src/utils/common/time.ts";
export * from "./src/utils/common/json.ts";
export * from "./src/utils/wecom.ts";

export * from "./src/schemas/error.ts";
export * from "./src/schemas/wecom.ts";

export * from "./src/controllers/openapi-docs.controller.ts";

export * from "./src/transport/sse.ts";

export * from "./src/service/llms/ollama.ts";
export * from "./src/service/llms/qwen.ts";

export * from "./src/middleware/imitate-tool-use.middleware.ts";
export * from "./src/middleware/thinking.middleware.ts";

export * from "./src/set-up-mcp-compose.ts";
