import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { ErrorSchema as _ErrorSchema } from "../schemas/error.ts";
import { server } from "../app.ts";
import { INCOMING_MSG_ROUTE_PATH } from "../set-up-mcp-compose.ts";
import { handleConnecting } from "../transport/sse.ts";

export const sseHandler = (app: OpenAPIHono) =>
  app.openapi(
    createRoute({
      hide: true,
      method: "get",
      path: "/sse",
      responses: {
        200: {
          content: {
            "text/event-stream": {
              schema: z.any(),
            },
          },
          description: "Returns the processed message",
        },
        400: {
          content: {
            "application/json": {
              schema: z.any(),
            },
          },
          description: "Returns an error",
        },
      },
    }),
    async (c) => {
      const response = await handleConnecting(
        c.req.raw,
        server,
        INCOMING_MSG_ROUTE_PATH
      );
      return response;
    },
    (result, c) => {
      if (!result.success) {
        return c.json(
          {
            code: 400,
            message: result.error.message,
          },
          400
        );
      }
    }
  );
