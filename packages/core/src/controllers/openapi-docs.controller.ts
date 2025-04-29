import type { OpenAPIHono } from "@hono/zod-openapi";

export const openApiDocsHandler: (app: OpenAPIHono) => OpenAPIHono = (
  app: OpenAPIHono
) =>
  app.doc("/openapi-docs", {
    openapi: "3.0.0",
    info: {
      version: "0.0.1",
      title: "billing-agent-api",
    },
  });
