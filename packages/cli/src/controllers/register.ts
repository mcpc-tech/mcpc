import type { OpenAPIHono } from "@hono/zod-openapi";
import { messageHandler } from "./messages.controller.ts";
import { sseHandler } from "./sse.controller.ts";
import { coreHandler } from "./core.controller.ts";

export const registerAgent = (app: OpenAPIHono) => {
  messageHandler(app);
  sseHandler(app);
  coreHandler(app);
};
