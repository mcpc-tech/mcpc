---
name: version-upgrade
description: Upgrades mcpc package versions and their dependencies. Handles core version bump and syncs all dependent packages accordingly. Also updates CLI version in code.
---

# Version Upgrade Skill

Upgrade mcpc package versions and their dependencies.

## When to Use

User asks to upgrade versions, like:

- "upgrade core version"
- "upgrade all packages"
- "bump versions"

## Steps

### 1. Read Current Versions

Read each `packages/*/deno.json` to find current versions.

- Core is the base - upgrade it first
- Other packages depend on core

### 2. Increment Version

For each package:

- Increment the appropriate segment (patch/minor/major)
- Match the pattern: if core goes 0.3.38 → 0.3.39, dependents should reference
  ^0.3.39

### 3. Sync CLI Version

If CLI is updated:

- Find `CLI_VERSION` in `packages/cli/src/config/loader.ts`
- Update to match cli deno.json version

### 4. Verify

```bash
deno lint
deno test --allow-all packages/*/tests/
```

## Version Patterns

| Type    | Pattern | When                     |
| ------- | ------- | ------------------------ |
| Core    | 0.3.x   | Feature additions        |
| CLI     | 0.1.x   | Feature additions        |
| Utils   | 0.2.x   | Feature additions        |
| Plugins | 0.0.x   | Patch=fix, Minor=feature |

## Key Files to Update

- `packages/core/deno.json` - base version
- `packages/*/deno.json` - each package's version + core dependency
- `packages/cli/src/config/loader.ts` - CLI_VERSION constant

## Tips

- Always upgrade core first, then dependents
- Check for dependency warnings with `deno lint`
- Update CLI_VERSION to match deno.json version
