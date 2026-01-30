---
name: git-workflow
description: Git workflow best practices and procedures
tags: ["git", "workflow", "version-control"]
---

# Git Workflow

This skill provides guidance on Git workflows, branching strategies, and best
practices.

## Branching Strategy

### Main Branches

- **main/master**: Production-ready code
- **develop**: Integration branch for features

### Supporting Branches

- **feature/***: New features
- **release/***: Release preparation
- **hotfix/***: Production fixes

## Workflow Steps

1. Create feature branch from develop
2. Make commits with clear messages
3. Push branch and create PR
4. Code review and approval
5. Merge to develop
6. Release when ready

## Commit Message Format

```
type(scope): subject

body

footer
```

Types: feat, fix, docs, style, refactor, test, chore

## References

- See [Hotfix Procedure](references/hotfix.md) for emergency fixes
