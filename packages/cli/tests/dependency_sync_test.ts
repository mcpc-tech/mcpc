import { assertEquals, assertExists } from "@std/assert";

const cliPackagePath = new URL("../deno.json", import.meta.url);
const codeExecutionPackagePath = new URL(
  "../../plugin-code-execution/deno.json",
  import.meta.url,
);
const codeExecutionSamplingPackagePath = new URL(
  "../../plugin-code-execution-sampling/deno.json",
  import.meta.url,
);

async function readVersion(filePath: URL): Promise<string | undefined> {
  const pkg = JSON.parse(await Deno.readTextFile(filePath)) as {
    version?: string;
  };
  return pkg.version;
}

async function readCliImports(): Promise<Record<string, string>> {
  const cliPackage = JSON.parse(await Deno.readTextFile(cliPackagePath)) as {
    imports?: Record<string, string>;
  };
  return cliPackage.imports ?? {};
}

Deno.test("CLI package sync - plugin-code-execution jsr import tracks local package version", async () => {
  const cliImports = await readCliImports();
  const localVersion = await readVersion(codeExecutionPackagePath);
  const actualImport = cliImports["@mcpc/plugin-code-execution"];

  assertExists(actualImport);
  assertExists(localVersion);
  assertEquals(
    actualImport,
    `jsr:@mcpc/plugin-code-execution@^${localVersion}`,
  );
});

Deno.test("CLI package sync - plugin-code-execution-sampling jsr import tracks local package version", async () => {
  const cliImports = await readCliImports();
  const localVersion = await readVersion(codeExecutionSamplingPackagePath);
  const actualImport = cliImports["@mcpc/plugin-code-execution-sampling"];

  assertExists(actualImport);
  assertExists(localVersion);
  assertEquals(
    actualImport,
    `jsr:@mcpc/plugin-code-execution-sampling@^${localVersion}`,
  );
});
