import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { SVG_PATH_PREFIX } from "../set-up-mcp.ts";

export const diagramHandler = (app: OpenAPIHono) =>
  app.openapi(
    createRoute({
      method: "get",
      path: "/:id{.+\\.svg}",
      responses: {
        200: {
          content: {
            "image/svg+xml": {
              schema: z.any(),
            },
          },
          description: "Returns the SVG diagram",
        },
        404: {
          content: {
            "application/json": {
              schema: z.object({
                code: z.number(),
                message: z.string(),
              }),
            },
          },
          description: "Diagram not found",
        },
        500: {
          content: {
            "application/json": {
              schema: z.object({
                code: z.number(),
                message: z.string(),
              }),
            },
          },
          description: "Server error",
        },
      },
    }),
    async (c) => {
      const idWithExt = c.req.param("id");
      const filePath = `${SVG_PATH_PREFIX}/${idWithExt}`;

      // Check if file exists
      if (!existsSync(filePath)) {
        return c.json(
          {
            code: 404,
            message: `Diagram with ID ${idWithExt} not found`,
          },
          404
        );
      }

      try {
        // Read the SVG file
        const svgContent = await readFile(filePath, "utf-8");

        // Return the SVG with appropriate headers
        return new Response(svgContent, {
          headers: {
            "Content-Type": "image/svg+xml",
            "Cache-Control": "public, max-age=86400",
          },
        });
      } catch (error) {
        console.error(`Error serving diagram ${idWithExt}:`, error);
        return c.json(
          {
            code: 500,
            message: "Failed to serve diagram",
          },
          500
        );
      }
    }
  );
