## Enable repository git hooks

Our repo provides a tracked `.githooks/` directory containing a pre-commit hook
that runs the project's precommit tasks (for example `deno lint`, `deno check`,
and `deno fmt`).

To enable the tracked hooks locally, run:

```
git config core.hooksPath .githooks
```

This sets your local repository to use the committed hooks directory. After
running that command, pre-commit will automatically run the project's checks
when you commit changes.

If you prefer, you can run the precommit task manually at any time:

```
deno task precommit
```
