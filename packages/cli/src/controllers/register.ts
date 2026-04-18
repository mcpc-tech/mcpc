import type { OpenAPIHono } from "@hono/zod-openapi";
import { messageHandler } from "./messages.controller.ts";
import { sseHandler } from "./sse.controller.ts";
import { coreHandler } from "./core.controller.ts";
import { streamableHttpHandler } from "./streamable-http.controller.ts";
import type { MCPCConfig } from "../config/loader.ts";

export const registerAgent = (
  app: OpenAPIHono,
  config?: MCPCConfig,
  options?: { silent?: boolean },
) => {
  messageHandler(app);
  sseHandler(app);
  coreHandler(app);
  streamableHttpHandler(app, config, options);
};
