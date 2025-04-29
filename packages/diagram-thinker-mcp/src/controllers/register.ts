import type { OpenAPIHono } from "@hono/zod-openapi";
import { messageHandler } from "./messages.controller.ts";
import { sseHandler } from "./sse.controller.ts";

import { openApiDocsHandler } from "@mcpc/core";
import { diagramHandler } from "./diagram.controller.ts";

export const registerAgent = (app: OpenAPIHono) => {
  messageHandler(app);
  sseHandler(app);
  openApiDocsHandler(app);
  diagramHandler(app);
};
