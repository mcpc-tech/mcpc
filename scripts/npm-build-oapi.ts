import { build, emptyDir } from "@deno/dnt";
Deno.chdir(new URL("../packages/oapi-invoker-mcp", import.meta.url).pathname);

await emptyDir("./npm");

await build({
  scriptModule: false,
  entryPoints: ["./mod.ts"],
  outDir: "./npm",
  shims: {
    deno: true,
  },
  package: {
    name: "@mcpc/oapi-invoker-mcp",
    version: Deno.args[0],
    description: "Your package.",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/username/repo.git",
    },
    bugs: {
      url: "https://github.com/username/repo/issues",
    },
  },
  postBuild() {
    // steps to run after building and before running the tests
    Deno.copyFileSync("LICENSE", "npm/LICENSE");
    Deno.copyFileSync("README.md", "npm/README.md");
  },
});
