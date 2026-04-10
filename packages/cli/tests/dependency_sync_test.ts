import { assertEquals, assertExists } from "@std/assert";

const cliPackagePath = new URL("../deno.json", import.meta.url);
const codeExecutionPackagePath = new URL(
  "../../plugin-code-execution/deno.json",
  import.meta.url,
);

Deno.test("CLI package sync - plugin-code-execution npm import tracks local package version", async () => {
  const cliPackage = JSON.parse(await Deno.readTextFile(cliPackagePath)) as {
    imports?: Record<string, string>;
  };
  const codeExecutionPackage = JSON.parse(
    await Deno.readTextFile(codeExecutionPackagePath),
  ) as { version?: string };

  const actualImport = cliPackage.imports?.["@mcpc-tech/plugin-code-execution"];
  const localVersion = codeExecutionPackage.version;

  assertExists(actualImport);
  assertExists(localVersion);
  assertEquals(
    actualImport,
    `npm:@mcpc-tech/plugin-code-execution@^${localVersion}`,
  );
});
