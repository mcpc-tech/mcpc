/**
 * Basic usage example for @mcpc/plugin-bash-just
 *
 * Run: deno run --allow-all examples/basic-usage.ts
 */

import { mcpc } from "@mcpc/core";
import { createBashJustPlugin } from "../mod.ts";

const server = await mcpc(
  [{ name: "demo", version: "0.0.1" }, { capabilities: { tools: {} } }],
  [{
    name: "agent",
    description: "Demo agent with just-bash sandbox and optional CLI mode",
    deps: { mcpServers: {} },
    plugins: [
      createBashJustPlugin({
        fsMode: "memory",
        initialFiles: {
          "/data/hello.txt": "Hello from the sandbox!\n",
        },
        env: {
          PATH: "/usr/local/bin:/usr/bin:/bin",
          GREETING: "world",
        },
        cli: {
          enabled: true,
          allowCommands: ["whoami"],
          envMode: "empty",
        },
      }),
    ],
  }],
);

const tool = "agent__bash_just";

const r1 = await server.callTool(tool, {
  command: "echo Hello, $GREETING!",
}) as any;
console.log("interpreted:", r1.content[0].text.trim());

const r2 = await server.callTool(tool, {
  command: "cat /data/hello.txt",
}) as any;
console.log("seeded file:", r2.content[0].text.trim());

const r3 = await server.callTool(tool, {
  binary: "whoami",
  args: [],
}) as any;
console.log("real cli:", r3.content[0].text.trim());

await server.close?.();
