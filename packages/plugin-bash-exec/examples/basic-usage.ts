/**
 * Basic usage example for @mcpc/plugin-bash-exec
 *
 * Run: deno run --allow-all examples/basic-usage.ts
 */

import { mcpc } from "@mcpc/core";
import { createBashExecPlugin } from "../mod.ts";

const server = await mcpc(
  [{ name: "demo", version: "0.0.1" }, { capabilities: { tools: {} } }],
  [{
    name: "agent",
    description: "Demo agent with secure-exec mediated CLI execution",
    deps: { mcpServers: {} },
    plugins: [
      createBashExecPlugin({
        allowCommands: ["bash", "whoami", "pwd"],
        envMode: "allowlist",
        envAllowlist: ["USER", "HOME"],
      }),
    ],
  }],
);

const tool = "agent__bash_exec";

const r1 = await server.callTool(tool, {
  command: "echo hello-from-bash-exec",
}) as any;
console.log("shell command:", r1.content[0].text.trim());

const r2 = await server.callTool(tool, {
  binary: "whoami",
  args: [],
}) as any;
console.log("direct cli:", r2.content[0].text.trim());

const r3 = await server.callTool(tool, {
  binary: "pwd",
  args: [],
  cwd: Deno.cwd(),
}) as any;
console.log("cwd:", r3.content[0].text.trim());

await server.close?.();
