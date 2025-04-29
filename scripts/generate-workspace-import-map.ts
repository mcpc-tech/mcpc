import { join } from "node:path";
import deno from "../deno.json" with { type: "json" };
import { readFileSync } from "node:fs";
import { fstat } from "node:fs";
import { writeFileSync } from "node:fs";
const { workspace } = deno;

const importMap = {
  imports: {},
};

const patches = {
  "ai/mcp-stdio": "npm:ai@^4.3.1/mcp-stdio",
  "@modelcontextprotocol/sdk/types.js":
    "npm:@modelcontextprotocol/sdk@^1.8.0/types.js",
  "dayjs/plugin/timezone.js": "npm:dayjs@^1.11.13/plugin/timezone.js",
  "dayjs/plugin/utc.js": "npm:dayjs@^1.11.13/plugin/utc.js",
  "@modelcontextprotocol/sdk/server/mcp.js":
    "npm:@modelcontextprotocol/sdk@^1.8.0/server/mcp.js",
  "@modelcontextprotocol/sdk/server/stdio.js":
    "npm:@modelcontextprotocol/sdk@^1.8.0/server/stdio.js",
  "@modelcontextprotocol/sdk/server/index.js":
    "npm:@modelcontextprotocol/sdk@^1.8.0/server/index.js",
};

for (const w of workspace) {
  const wPath = join(w, "deno.json");
  const { name, imports } = JSON.parse(readFileSync(wPath, "utf-8"));

  importMap.imports = {
    ...importMap.imports,
    ...(imports ? imports : {}),
  };

  (importMap.imports as Record<string, string>)[name] = `./${
    join(w, "mod.ts")
  }`;
}

importMap.imports = {
  ...importMap.imports,
  ...(patches ? patches : {}),
};

writeFileSync(
  join(import.meta.dirname!, "../import_map.json"),
  JSON.stringify(importMap, null, 2),
);

console.log(JSON.stringify(importMap, null, 2));
