import type { OpenAPIHono } from "@hono/zod-openapi";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "../app.ts";
import { loadConfig } from "../config/loader.ts";
import type { MCPCConfig } from "../config/loader.ts";

export const streamableHttpHandler = (
  app: OpenAPIHono,
  providedConfig?: MCPCConfig,
  options?: { silent?: boolean },
) => {
  app.post("/mcp", async (c) => {
    try {
      // Use provided config or load from environment/file
      const config = providedConfig || await loadConfig();
      const server = await createServer(config ?? undefined, options);

      const body = await c.req.json();

      // Create a new transport for each request (stateless mode)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      // Handle cleanup on request close
      c.req.raw.signal?.addEventListener("abort", () => {
        transport.close();
      });

      // Connect server to transport
      await server.connect(transport);

      // Create adapter for Web API Request/Response
      const request = c.req.raw;
      const { writable } = new TransformStream();
      const writer = writable.getWriter();

      // Capture response
      let captured: any = null;
      const mockResponse = {
        statusCode: 200,
        setHeader: () => {},
        writeHead: () => {},
        write: (chunk: any) => {
          try {
            const text = typeof chunk === "string" ? chunk : chunk.toString();
            captured = JSON.parse(text);
          } catch {
            // ignore parse errors
          }
        },
        end: () => {
          writer.close();
        },
      } as any;

      // Handle the request through transport
      await transport.handleRequest(request as any, mockResponse, body);

      // Close transport after handling
      transport.close();

      // Return captured response
      if (captured) {
        return c.json(captured);
      }

      return c.json({ error: "No response captured" }, 500);
    } catch (error) {
      console.error("Streamable HTTP error:", error);
      return c.json(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });
};
