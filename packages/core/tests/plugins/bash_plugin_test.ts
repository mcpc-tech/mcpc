/**
 * E2E tests for core bash plugin (default + sandbox mode)
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { mcpc } from "../../mod.ts";
import { createBashPlugin } from "../../src/plugins/bash.ts";

const AGENT_NAME = "agent";
const TOOL_NAME = `${AGENT_NAME}__bash`;

// deno-lint-ignore no-explicit-any
function execBash(server: any, command: string, cwd?: string) {
  return server.callTool(TOOL_NAME, { command, cwd });
}

Deno.test("bash — default mode executes real bash", async () => {
  const server = await mcpc(
    [{ name: "test-bash-default", version: "1.0.0" }, {}],
    [{
      name: AGENT_NAME,
      description: "Test agent",
      deps: { mcpServers: {} },
      plugins: [createBashPlugin()],
    }],
  );

  try {
    // deno-lint-ignore no-explicit-any
    const r: any = await execBash(server, "echo hello-world");
    assertEquals(r.isError, false);
    assertStringIncludes(r.content[0].text, "hello-world");
  } finally {
    await server.close?.();
  }
});

Deno.test("bash — sandbox replaces default execution", async () => {
  let sandboxCalled = false;
  let receivedCommand = "";

  const sandbox = (
    command: string,
    _opts: { cwd: string; signal: AbortSignal },
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> => {
    sandboxCalled = true;
    receivedCommand = command;
    return Promise.resolve({
      stdout: `SANDBOX:${command}`,
      stderr: "",
      exitCode: 0,
    });
  };

  const server = await mcpc(
    [{ name: "test-bash-sandbox", version: "1.0.0" }, {}],
    [{
      name: AGENT_NAME,
      description: "Test agent",
      deps: { mcpServers: {} },
      plugins: [createBashPlugin({ sandbox })],
    }],
  );

  try {
    // deno-lint-ignore no-explicit-any
    const r: any = await execBash(server, "ls -la");
    assertEquals(sandboxCalled, true);
    assertEquals(receivedCommand, "ls -la");
    assertEquals(r.isError, false);
    assertStringIncludes(r.content[0].text, "SANDBOX:ls -la");
  } finally {
    await server.close?.();
  }
});

Deno.test("bash — sandbox exitCode non-zero sets isError", async () => {
  const sandbox = () =>
    Promise.resolve({
      stdout: "",
      stderr: "boom",
      exitCode: 1,
    });

  const server = await mcpc(
    [{ name: "test-bash-err", version: "1.0.0" }, {}],
    [{
      name: AGENT_NAME,
      description: "Test agent",
      deps: { mcpServers: {} },
      plugins: [createBashPlugin({ sandbox })],
    }],
  );

  try {
    // deno-lint-ignore no-explicit-any
    const r: any = await execBash(server, "whatever");
    assertEquals(r.isError, true);
    assertStringIncludes(r.content[0].text, "boom");
  } finally {
    await server.close?.();
  }
});

Deno.test("bash — sandbox receives cwd from args", async () => {
  let receivedCwd = "";

  const sandbox = (
    _command: string,
    opts: { cwd: string; signal: AbortSignal },
  ) => {
    receivedCwd = opts.cwd;
    return Promise.resolve({ stdout: "ok", stderr: "", exitCode: 0 });
  };

  const server = await mcpc(
    [{ name: "test-bash-cwd", version: "1.0.0" }, {}],
    [{
      name: AGENT_NAME,
      description: "Test agent",
      deps: { mcpServers: {} },
      plugins: [createBashPlugin({ sandbox })],
    }],
  );

  try {
    // deno-lint-ignore no-explicit-any
    await (server.callTool as any)(TOOL_NAME, {
      command: "pwd",
      cwd: "/tmp",
    });
    assertEquals(receivedCwd, "/tmp");
  } finally {
    await server.close?.();
  }
});
