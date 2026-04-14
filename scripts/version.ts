#!/usr/bin/env -S deno run --allow-read --allow-write

const args = Deno.args;
const versionType = args[0] || "patch"; // patch, minor, major

if (!["patch", "minor", "major"].includes(versionType)) {
  console.error("Usage: deno task version [patch|minor|major]");
  Deno.exit(1);
}

interface PackageJson {
  name: string;
  version: string;
  imports?: Record<string, unknown>;
  [key: string]: unknown;
}

function bumpVersion(version: string, type: string): string {
  const [major, minor, patch] = version.split(".").map(Number);

  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      return version;
  }
}

function syncWorkspaceImportVersions(
  pkg: PackageJson,
  versionMap: Map<string, string>,
): void {
  if (!pkg.imports || typeof pkg.imports !== "object") {
    return;
  }

  for (const [key, value] of Object.entries(pkg.imports)) {
    if (typeof value !== "string") {
      continue;
    }

    const jsrMatch = value.match(
      /^jsr:(@mcpc\/[^@/]+)@\^(\d+\.\d+\.\d+)(\/.*)?$/,
    );
    if (jsrMatch) {
      const [, depName, currentVersion, suffix = ""] = jsrMatch;
      const nextVersion = versionMap.get(depName);

      if (!nextVersion || nextVersion === currentVersion) {
        continue;
      }

      pkg.imports[key] = `jsr:${depName}@^${nextVersion}${suffix}`;
      console.log(
        `Synced ${pkg.name} import ${key}: ${currentVersion} → ${nextVersion}`,
      );
      continue;
    }

    const npmMatch = value.match(
      /^npm:(@mcpc-tech\/[^@/]+)@\^(\d+\.\d+\.\d+)(\/.*)?$/,
    );
    if (!npmMatch) {
      continue;
    }

    const [, depName, currentVersion, suffix = ""] = npmMatch;
    const workspaceDepName = depName.replace(/^@mcpc-tech\//, "@mcpc/");
    const nextVersion = versionMap.get(workspaceDepName);

    if (!nextVersion || nextVersion === currentVersion) {
      continue;
    }

    pkg.imports[key] = `npm:${depName}@^${nextVersion}${suffix}`;
    console.log(
      `Synced ${pkg.name} import ${key}: ${currentVersion} → ${nextVersion}`,
    );
  }
}

const packages = [
  "./packages/utils/deno.json",
  "./packages/core/deno.json",
  "./packages/cli/deno.json",
  "./packages/mcp-sampling-ai-provider/deno.json",
  "./packages/acp-ai-provider/deno.json",
  "./packages/mcpc-builder/deno.json",
  "./packages/plugin-code-execution/deno.json",
  "./packages/plugin-code-execution-sampling/deno.json",
  "./packages/plugin-markdown-loader/deno.json",
];

const packageEntries: Array<{
  pkgPath: string;
  pkg: PackageJson;
  oldVersion: string;
  newVersion: string;
}> = [];
const versionMap = new Map<string, string>();
let cliVersion: string | null = null;

for (const pkgPath of packages) {
  const content = await Deno.readTextFile(pkgPath);
  const pkg = JSON.parse(content) as PackageJson;
  const oldVersion = pkg.version;
  const newVersion = bumpVersion(oldVersion, versionType);

  pkg.version = newVersion;
  versionMap.set(pkg.name, newVersion);
  packageEntries.push({ pkgPath, pkg, oldVersion, newVersion });

  if (pkg.name === "@mcpc/cli") {
    cliVersion = newVersion;
  }
}

for (const { pkgPath, pkg, oldVersion, newVersion } of packageEntries) {
  syncWorkspaceImportVersions(pkg, versionMap);

  await Deno.writeTextFile(
    pkgPath,
    JSON.stringify(pkg, null, 2) + "\n",
  );

  console.log(`${pkg.name}: ${oldVersion} → ${newVersion}`);
}

if (cliVersion) {
  const loaderPath = "./packages/cli/src/config/loader.ts";
  const loaderContent = await Deno.readTextFile(loaderPath);
  const updatedLoaderContent = loaderContent.replace(
    /const CLI_VERSION = "[^"]+";/,
    `const CLI_VERSION = "${cliVersion}";`,
  );

  await Deno.writeTextFile(loaderPath, updatedLoaderContent);
  console.log(`Synced CLI_VERSION to ${cliVersion}`);
}

console.log(`\n✓ All packages updated to ${versionType} version`);
