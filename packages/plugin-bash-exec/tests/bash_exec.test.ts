/**
 * E2E tests for plugin-bash-exec
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { mcpc } from "@mcpc/core";
import { createBashExecPlugin } from "../mod.ts";

const AGENT_NAME = "agent";
const TOOL_NAME = `${AGENT_NAME}__bash_exec`;
const TEST_OPTS = { sanitizeOps: false, sanitizeResources: false };

function makeServer(
  pluginOpts: Parameters<typeof createBashExecPlugin>[0] = {},
) {
  return mcpc(
    [{ name: "test-bash-exec", version: "0.0.1" }, {
      capabilities: { tools: {} },
    }],
    [{
      name: AGENT_NAME,
      description: "Test agent",
      deps: { mcpServers: {} },
      plugins: [createBashExecPlugin(pluginOpts)],
    }],
  );
}

async function createScript(body: string) {
  const dir = await Deno.makeTempDir({ prefix: "bash-exec-cli-" });
  const scriptPath = `${dir}/tool.sh`;
  await Deno.writeTextFile(
    scriptPath,
    `#!/usr/bin/env bash
set -eu
${body}
`,
  );
  await Deno.chmod(scriptPath, 0o755);
  return { dir, scriptPath };
}

// deno-lint-ignore no-explicit-any
function callTool(server: any, args: Record<string, unknown>) {
  return server.callTool(TOOL_NAME, args);
}

Deno.test(
  { name: "bash_exec — shell command mode still works", ...TEST_OPTS },
  async () => {
    const server = await makeServer({ allowCommands: ["bash"] });
    try {
      // deno-lint-ignore no-explicit-any
      const r: any = await callTool(server, {
        command: "echo hello-from-shell",
      });
      assertEquals(r.isError, undefined);
      assertStringIncludes(r.content[0].text, "hello-from-shell");
    } finally {
      await server.close?.();
    }
  },
);

Deno.test(
  { name: "bash_exec — direct custom CLI succeeds", ...TEST_OPTS },
  async () => {
    const { dir, scriptPath } = await createScript(
      'printf "custom:%s:%s\\n" "$1" "${MY_VAR:-missing}"',
    );
    const server = await makeServer({
      env: { MY_VAR: "hello" },
      envMode: "empty",
      allowCommands: [scriptPath],
    });
    try {
      // deno-lint-ignore no-explicit-any
      const r: any = await callTool(server, {
        binary: scriptPath,
        args: ["world"],
      });
      assertEquals(r.isError, undefined);
      assertStringIncludes(r.content[0].text, "custom:world:hello");
    } finally {
      await server.close?.();
      await Deno.remove(dir, { recursive: true }).catch(() => {});
    }
  },
);

Deno.test(
  { name: "bash_exec — denied binary is blocked", ...TEST_OPTS },
  async () => {
    const server = await makeServer({ denyCommands: ["whoami"] });
    try {
      // deno-lint-ignore no-explicit-any
      const r: any = await callTool(server, { binary: "whoami" });
      assertEquals(r.isError, true);
      assertStringIncludes(r.content[0].text, "DENIED");
    } finally {
      await server.close?.();
    }
  },
);

Deno.test(
  { name: "bash_exec — argument policy is enforced", ...TEST_OPTS },
  async () => {
    const { dir, scriptPath } = await createScript('printf "arg:%s\\n" "$1"');
    const server = await makeServer({
      allowCommands: [scriptPath],
      allowArgs: {
        [scriptPath]: [["--ok"]],
      },
    });
    try {
      // deno-lint-ignore no-explicit-any
      const r: any = await callTool(server, {
        binary: scriptPath,
        args: ["--blocked"],
      });
      assertEquals(r.isError, true);
      assertStringIncludes(r.content[0].text, "DENIED");
    } finally {
      await server.close?.();
      await Deno.remove(dir, { recursive: true }).catch(() => {});
    }
  },
);

Deno.test(
  { name: "bash_exec — cwd restriction is enforced", ...TEST_OPTS },
  async () => {
    const { dir, scriptPath } = await createScript("pwd");
    const allowedDir = await Deno.makeTempDir({ prefix: "bash-exec-allowed-" });
    const blockedDir = await Deno.makeTempDir({ prefix: "bash-exec-blocked-" });
    const server = await makeServer({
      allowCommands: [scriptPath],
      allowCwdPrefixes: [allowedDir],
    });
    try {
      // deno-lint-ignore no-explicit-any
      const r: any = await callTool(server, {
        binary: scriptPath,
        cwd: blockedDir,
      });
      assertEquals(r.isError, true);
      assertStringIncludes(r.content[0].text, "DENIED");
    } finally {
      await server.close?.();
      await Deno.remove(dir, { recursive: true }).catch(() => {});
      await Deno.remove(allowedDir, { recursive: true }).catch(() => {});
      await Deno.remove(blockedDir, { recursive: true }).catch(() => {});
    }
  },
);

Deno.test(
  { name: "bash_exec — env allowlist is enforced", ...TEST_OPTS },
  async () => {
    const { dir, scriptPath } = await createScript(
      'printf "visible:%s secret:%s\\n" "${VISIBLE:-missing}" "${HOST_SECRET:-missing}"',
    );
    const server = await makeServer({
      env: { VISIBLE: "from-host" },
      allowCommands: [scriptPath],
      envMode: "allowlist",
      envAllowlist: ["VISIBLE"],
    });
    try {
      // deno-lint-ignore no-explicit-any
      const r: any = await callTool(server, { binary: scriptPath });
      assertEquals(r.isError, undefined);
      assertStringIncludes(r.content[0].text, "visible:from-host");
      assertStringIncludes(r.content[0].text, "secret:missing");
    } finally {
      await server.close?.();
      await Deno.remove(dir, { recursive: true }).catch(() => {});
    }
  },
);

Deno.test(
  { name: "bash_exec — timeout aborts long-running cli", ...TEST_OPTS },
  async () => {
    const { dir, scriptPath } = await createScript("sleep 2");
    const server = await makeServer({
      timeoutMs: 200,
      allowCommands: [scriptPath],
    });
    try {
      // deno-lint-ignore no-explicit-any
      const r: any = await callTool(server, { binary: scriptPath });
      assertEquals(r.isError, true);
      assertStringIncludes(r.content[0].text, "TIMEOUT");
    } finally {
      await server.close?.();
      await Deno.remove(dir, { recursive: true }).catch(() => {});
    }
  },
);
