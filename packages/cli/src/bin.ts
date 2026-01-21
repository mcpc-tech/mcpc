/**
 * MCPC CLI STDIO Server
 * @module
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./app.ts";
import { loadConfig } from "./config/loader.ts";
import { getAgentPlugins } from "./defaults.ts";

(async () => {
  const config = await loadConfig();

  // Add agent-level plugins (skip string paths - resolved by markdownLoaderPlugin)
  config?.agents.forEach((agent) => {
    if (typeof agent === "string") return;
    agent.plugins = [...(agent.plugins || []), ...getAgentPlugins()];
  });

  console.error(
    config
      ? `Loaded configuration with ${config.agents.length} agent(s)`
      : "No configuration found, using default example configuration",
  );

  const server = await createServer(config || undefined);
  const transport = new StdioServerTransport();
  await server.connect(transport);
})();
