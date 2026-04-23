---
name: release-v5-acp
description: Release @mcpc/acp-ai-provider package for AI SDK v5 (0.1.x versions) from release-v5 branch. Handles version bump, tagging, and publishing workflow.
---

# Release ACP AI Provider for AI SDK v5

Release `@mcpc/acp-ai-provider` package for the AI SDK v5 compatibility line
(version 0.1.x).

## Version Compatibility

| ACP Version | AI SDK Version | Branch       |
| ----------- | -------------- | ------------ |
| `0.2.x`     | v6             | `main`       |
| `0.1.x`     | v5             | `release-v5` |

## When to Use

- Fix bugs in AI SDK v5 compatibility line
- Release new 0.1.x versions
- Backport fixes from main to release-v5

## Steps

### 1. Switch to release-v5 Branch

```bash
git checkout release-v5
git pull origin release-v5
```

### 2. Apply Fixes (if needed)

Cherry-pick fixes from main:

```bash
git cherry-pick <commit-hash>
```

Or manually apply changes. Note: release-v5 uses AI SDK V2 types
(`LanguageModelV2StreamPart`), main uses V3 (`LanguageModelV3StreamPart`).

### 3. Update Version

Edit `packages/acp-ai-provider/deno.json`:

```json
{
  "version": "0.1.x" // Increment patch version
}
```

### 4. Verify Changes

```bash
deno fmt packages/acp-ai-provider/
deno check packages/acp-ai-provider/mod.ts
deno test --allow-all packages/acp-ai-provider/tests/
```

### 5. Commit

```bash
git add packages/acp-ai-provider/deno.json
git commit -m "chore(acp-ai-provider): bump version to 0.1.x"
```

### 6. Create and Push Tag

```bash
git tag v0.1.x  # Use the new version
git push origin release-v5
git push origin v0.1.x
```

### 7. Update Downstream Packages (Optional)

If core or other packages need to use the new version:

1. Update `packages/core/deno.json`:
   ```json
   "@mcpc/acp-ai-provider": "npm:@mcpc-tech/acp-ai-provider@^0.1.x"
   ```

2. Bump core version (0.3.x → 0.3.x+1)

3. Sync all dependent packages to use new core version

4. Tag core: `git tag v0.3.x+1`

## Key Differences from Main

| Aspect  | release-v5                  | main                        |
| ------- | --------------------------- | --------------------------- |
| AI SDK  | V2                          | V3                          |
| Version | 0.1.x                       | 0.2.x                       |
| Types   | `LanguageModelV2StreamPart` | `LanguageModelV3StreamPart` |
| ACP SDK | ^0.4.8                      | ^0.14.1                     |

## Tips

- Always test with AI SDK v5 before releasing
- Keep version commits separate from fix commits
- Use `chore(acp-ai-provider):` prefix for version bumps
- Tag format: `v0.1.x` (matches the package version)
