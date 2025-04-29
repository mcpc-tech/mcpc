import { writeFileSync } from "node:fs";
import { join } from "node:path";

const officalSpecs = {
  github:
    "https://raw.githubusercontent.com/github/rest-api-description/refs/heads/main/descriptions-next/api.github.com/api.github.com.json",

  local: (packageName: string) =>
    `http://127.0.0.1:9000/${packageName}/oapi-docs`,
};

const [packageName] = Deno.args;

// Update capi spec
const updateCAPISpec = async () => {
  const specUrl =
    officalSpecs[packageName as keyof typeof officalSpecs] ??
    officalSpecs.local(packageName);
  const res = await fetch(
    typeof specUrl === "function" ? specUrl(packageName) : specUrl
  );
  const json = await res.json();
  const path = join(
    import.meta.dirname!,
    `../packages/${packageName}-mcp/src/source/${packageName}.oapi.json`
  );
  console.log("Fetched CAPI spec, writing to file...", { path });

  writeFileSync(path, JSON.stringify(json));
  console.log(`OAPI spec written to ${path}`);
};
updateCAPISpec();
