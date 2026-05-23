/**
 * E2E tests for plugin-bash-just
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { mcpc } from "@mcpc/core";
import { createBashJustPlugin } from "../mod.ts";

const AGENT_NAME = "agent";
const TOOL_NAME = `${AGENT_NAME}__bash_just`;

function makeServer(
  pluginOpts: Parameters<typeof createBashJustPlugin>[0] = {},
) {
  return mcpc(
    [{ name: "test-bash-just", version: "0.0.1" }, {
      capabilities: { tools: {} },
    }],
    [{
      name: AGENT_NAME,
      description: "Test agent",
      deps: { mcpServers: {} },
      plugins: [createBashJustPlugin(pluginOpts)],
    }],
  );
}

async function createScript(body: string) {
  const dir = await Deno.makeTempDir({ prefix: "bash-just-cli-" });
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

Deno.test("bash_just — interpreter mode still executes just-bash commands", async () => {
  const server = await makeServer({
    env: { GREETING: "world" },
    initialFiles: { "/workspace/message.txt": "hello from memory" },
  });
  try {
    // deno-lint-ignore no-explicit-any
    const r: any = await callTool(server, {
      command: "echo $GREETING && cat /workspace/message.txt",
    });
    assertEquals(r.isError, undefined);
    assertStringIncludes(r.content[0].text, "world");
    assertStringIncludes(r.content[0].text, "hello from memory");
  } finally {
    await server.close?.();
  }
});

Deno.test("bash_just — real CLI mode executes a custom script", async () => {
  const { dir, scriptPath } = await createScript(
    'printf "custom:%s:%s\\n" "$1" "${MY_VAR:-missing}"',
  );
  const server = await makeServer({
    env: { MY_VAR: "hello" },
    cli: {
      enabled: true,
      allowCommands: [scriptPath],
      envMode: "empty",
    },
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
});

Deno.test("bash_just — denied binary is blocked by policy", async () => {
  const server = await makeServer({
    cli: {
      enabled: true,
      denyCommands: ["whoami"],
    },
  });
  try {
    // deno-lint-ignore no-explicit-any
    const r: any = await callTool(server, { binary: "whoami", args: [] });
    assertEquals(r.isError, true);
    assertStringIncludes(r.content[0].text, "DENIED");
  } finally {
    await server.close?.();
  }
});

Deno.test("bash_just — argument policy is enforced for real CLI", async () => {
  const { dir, scriptPath } = await createScript(
    'printf "arg:%s\\n" "$1"',
  );
  const server = await makeServer({
    cli: {
      enabled: true,
      allowCommands: [scriptPath],
      allowArgs: {
        [scriptPath]: [["--ok"]],
      },
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
});

Deno.test("bash_just — cwd policy is enforced for real CLI", async () => {
  const { dir, scriptPath } = await createScript("pwd");
  const allowedDir = await Deno.makeTempDir({ prefix: "bash-just-allowed-" });
  const blockedDir = await Deno.makeTempDir({ prefix: "bash-just-blocked-" });
  const server = await makeServer({
    cli: {
      enabled: true,
      allowCommands: [scriptPath],
      allowCwdPrefixes: [allowedDir],
    },
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
});

Deno.test("bash_just — env allowlist is enforced for real CLI", async () => {
  const { dir, scriptPath } = await createScript(
    'printf "visible:%s secret:%s\\n" "${VISIBLE:-missing}" "${HOST_SECRET:-missing}"',
  );
  const originalVisible = Deno.env.get("VISIBLE");
  const originalHostSecret = Deno.env.get("HOST_SECRET");
  Deno.env.set("VISIBLE", "from-host");
  Deno.env.set("HOST_SECRET", "should-not-leak");
  const server = await makeServer({
    cli: {
      enabled: true,
      allowCommands: [scriptPath],
      envMode: "allowlist",
      envAllowlist: ["VISIBLE"],
    },
  });
  try {
    // deno-lint-ignore no-explicit-any
    const r: any = await callTool(server, { binary: scriptPath });
    assertEquals(r.isError, undefined);
    assertStringIncludes(r.content[0].text, "visible:from-host");
    assertStringIncludes(r.content[0].text, "secret:missing");
  } finally {
    Deno.env.set("VISIBLE", originalVisible ?? "");
    Deno.env.set("HOST_SECRET", originalHostSecret ?? "");
    await server.close?.();
    await Deno.remove(dir, { recursive: true }).catch(() => {});
  }
});

Deno.test("bash_just — real CLI timeout is enforced", async () => {
  const { dir, scriptPath } = await createScript("exec sleep 2");
  const server = await makeServer({
    timeoutMs: 200,
    cli: {
      enabled: true,
      allowCommands: [scriptPath],
    },
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
});
