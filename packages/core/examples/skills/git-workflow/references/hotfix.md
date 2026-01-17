# Hotfix Procedure

## When to Use

- Critical production bugs
- Security vulnerabilities
- Data corruption issues

## Steps

1. **Create hotfix branch from main**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b hotfix/critical-bug
   ```

2. **Fix the issue**
   - Make minimal changes
   - Add tests for the fix
   - Update version number

3. **Merge to main**
   ```bash
   git checkout main
   git merge --no-ff hotfix/critical-bug
   git tag -a 1.2.1
   git push origin main --tags
   ```

4. **Merge back to develop**
   ```bash
   git checkout develop
   git merge --no-ff hotfix/critical-bug
   git push origin develop
   ```

5. **Cleanup**
   ```bash
   git branch -d hotfix/critical-bug
   ```

## Important

- Hotfixes bypass normal release process
- Must be reviewed before merge
- Notify team immediately
