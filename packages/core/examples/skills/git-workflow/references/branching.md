# Branching Strategy

## Main Branches

- `main` - Production-ready code
- `develop` - Integration branch for features

## Supporting Branches

### Feature Branches

```bash
git checkout -b feature/user-auth develop
# ... work on feature ...
git checkout develop
git merge --no-ff feature/user-auth
git branch -d feature/user-auth
```

### Release Branches

```bash
git checkout -b release/1.2.0 develop
# ... bump version, fix bugs ...
git checkout main
git merge --no-ff release/1.2.0
git tag -a 1.2.0
git checkout develop
git merge --no-ff release/1.2.0
```

## Best Practices

1. Keep branches short-lived
2. Merge frequently
3. Delete branches after merge
4. Use descriptive branch names
