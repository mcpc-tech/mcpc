import { assertEquals } from "@std/assert";
import { loadConfig } from "../src/config/loader.ts";

Deno.test("proxy mode - parse command correctly", async () => {
  // Save original argv
  const originalArgv = Deno.args;

  try {
    // Mock process.argv for proxy mode
    const mockArgv = [
      "--proxy",
      "--transport-type",
      "stdio",
      "--",
      "npx",
      "-y",
      "@wonderwhy-er/desktop-commander",
    ];

    // Set process.argv
    Object.defineProperty(globalThis, "process", {
      value: {
        ...globalThis.process,
        argv: ["deno", "run", ...mockArgv],
        env: {},
        cwd: () => Deno.cwd(),
        exit: (code: number) => {
          throw new Error(`Process exited with code ${code}`);
        },
      },
      configurable: true,
    });

    const config = await loadConfig();

    assertEquals(config?.name, "desktop-commander-proxy");
    assertEquals(config?.agents.length, 1);
    assertEquals(config?.agents[0].name, "desktop-commander");
    assertEquals(
      config?.agents[0].deps?.mcpServers?.["desktop-commander"]?.command,
      "npx",
    );
    assertEquals(
      config?.agents[0].deps?.mcpServers?.["desktop-commander"]?.args,
      ["-y", "@wonderwhy-er/desktop-commander"],
    );
    assertEquals(
      config?.agents[0].deps?.mcpServers?.["desktop-commander"]?.transportType,
      "stdio",
    );
  } finally {
    // Restore original argv
    Object.defineProperty(globalThis, "Deno", {
      value: { ...Deno, args: originalArgv },
    });
  }
});
