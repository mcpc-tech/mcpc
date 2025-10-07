#!/usr/bin/env -S deno run --allow-read --allow-write

const args = Deno.args;
const versionType = args[0] || "patch"; // patch, minor, major

if (!["patch", "minor", "major"].includes(versionType)) {
  console.error("Usage: deno task version [patch|minor|major]");
  Deno.exit(1);
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

const packages = [
  "./packages/utils/deno.json",
  "./packages/core/deno.json",
  "./packages/cli/deno.json",
  "./packages/mcp-sampling-ai-provider/deno.json",
];

for (const pkgPath of packages) {
  const content = await Deno.readTextFile(pkgPath);
  const pkg = JSON.parse(content);
  const oldVersion = pkg.version;
  const newVersion = bumpVersion(oldVersion, versionType);

  pkg.version = newVersion;

  await Deno.writeTextFile(
    pkgPath,
    JSON.stringify(pkg, null, 2) + "\n",
  );

  console.log(`${pkg.name}: ${oldVersion} → ${newVersion}`);
}

console.log(`\n✓ All packages updated to ${versionType} version`);
