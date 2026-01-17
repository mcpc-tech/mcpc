---
name: git-workflow
description: Git branching and commit best practices. Use when working with git branches, commits, or merges.
metadata:
  author: mcpc-team
  version: "1.0"
---

# Git Workflow

## Branch Naming Convention

- `feature/xxx` - New features
- `bugfix/xxx` - Bug fixes
- `hotfix/xxx` - Urgent production fixes
- `release/xxx` - Release preparation

## Commit Message Format

```
<type>(<scope>): <subject>

<body>
```

Types: feat, fix, docs, style, refactor, test, chore

## Workflow Steps

1. Create branch from main
2. Make changes and commit
3. Push and create PR
4. Code review
5. Merge to main

For detailed branching strategy, load `references/branching.md` For hotfix
procedures, load `references/hotfix.md`
