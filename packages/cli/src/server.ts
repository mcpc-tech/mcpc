/** MCPC CLI Server - HTTP server for MCPC development and testing.
 *
 * This module provides a standalone HTTP server that serves the MCPC core
 * application using Hono framework with OpenAPI support. It's primarily
 * used for development, testing, and providing HTTP endpoints for MCPC
 * functionality.
 *
 * The server runs on port 9000 by default (configurable via PORT env var)
 * and binds to all interfaces (0.0.0.0) for accessibility.
 *
 * Configuration:
 * - PORT: HTTP server port (default: 9000)
 * - MCPC_CONFIG: JSON string with agent configuration
 * - MCPC_CONFIG_FILE: Path to JSON config file
 * - Default: ./mcpc.config.json
 *
 * # Set custom port
 * PORT=8080 deno run --allow-net --allow-env packages/cli/src/server.ts
 *
 * # With configuration
 * MCPC_CONFIG='[{"name":"my-agent","description":"...","deps":{...}}]' deno run --allow-all packages/cli/src/server.ts
 *
 * // The server automatically mounts the core app at /core route
 * // Access OpenAPI docs at: http://localhost:9000/core/docs
 *
 * @module
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { createApp } from "./app.ts";
import { loadConfig } from "./config/loader.ts";
import process from "node:process";
import { getAgentPlugins } from "./defaults.ts";

const port = Number(process.env.PORT || "3002");
const hostname = "0.0.0.0";

function parseArgs(args: string[]): { silent: boolean } {
  return {
    silent: args.includes("--silent"),
  };
}

async function main() {
  const { silent } = parseArgs(Deno.args);

  // Load configuration from environment or file
  const config = await loadConfig();

  // Add agent-level plugins (skip string paths)
  config?.agents.forEach((agent) => {
    if (typeof agent === "string") return;
    agent.plugins = [...(agent.plugins || []), ...getAgentPlugins()];
  });

  if (!silent) {
    if (config) {
      console.log(`Loaded configuration with ${config.agents.length} agent(s)`);
    } else {
      console.log(
        "No configuration found, using default example configuration",
      );
    }
  }

  const app = new OpenAPIHono();

  app.route("mcp", createApp(config || undefined, { silent }));

  Deno.serve(
    {
      port,
      hostname,
    },
    app.fetch,
  );
}

main();
