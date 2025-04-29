/**
 * 1. Use pnpm to install @mcpc/oapi-invoker-mcp to dir npm
 * 2. Copy transplied file to dir npm
 * 3. Generate package.json from deno.json
 * 4. Publish to npm
 */
import { $ } from "npm:dax-sh";

await $`mkdir -p npm/package`;
await $`pnpm install jsr:@mcpc/oapi-invoker-mcp --dir npm`;
await $`cp -r npm/node_modules/@mcpc/oapi-invoker-mcp npm/package`;
