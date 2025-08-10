/** MCPC Core Server - HTTP server for MCPC development and testing.
 *
 * This module provides a standalone HTTP server that serves the MCPC core
 * application using Hono framework with OpenAPI support. It's primarily
 * used for development, testing, and providing HTTP endpoints for MCPC
 * functionality.
 *
 * The server runs on port 9000 by default (configurable via PORT env var)
 * and binds to all interfaces (0.0.0.0) for accessibility.
 *
 * # Set custom port
 * PORT=8080 deno run --allow-net --allow-env packages/core/src/server.ts
 *
 * // The server automatically mounts the core app at /core route
 * // Access OpenAPI docs at: http://localhost:9000/core/docs
 *
 * @module
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { createApp } from "./app.ts";
import process from "node:process";

const port = Number(process.env.PORT || 9000);
const hostname = "0.0.0.0";

const app = new OpenAPIHono();

app.route("core", createApp());

Deno.serve(
  {
    port,
    hostname,
  },
  app.fetch,
);
