/**
 * @see https://github.com/honojs/middleware/tree/main/packages/zod-openapi
 */

import { OpenAPIHono } from "@hono/zod-openapi";

export const coreHandler = (app: OpenAPIHono) => {
  app.doc("/core-docs", {
    openapi: "3.0.0",
    info: {
      title: "tencentcloudapi openapi spec",
      version: "1.0.0",
      description: "openapi defination of tencentcloudapi",
    },
  });
};
