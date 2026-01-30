# Hotfix Procedure

Emergency fixes for production issues.

## Steps

1. Create branch from `main`:
   ```bash
   git checkout main
   git pull
   git checkout -b hotfix/critical-fix
   ```

2. Fix the issue and commit

3. Merge to both main and develop:
   ```bash
   git checkout main
   git merge hotfix/critical-fix
   git checkout develop
   git merge hotfix/critical-fix
   ```

4. Tag the release

5. Deploy immediately
