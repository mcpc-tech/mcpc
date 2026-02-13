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

## Deno Installation

This project uses Deno. See the
[official installation guide](https://docs.deno.com/runtime/getting_started/installation/)
for setup instructions.

## Running Tests

Run all tests:

```
deno test
```

Run tests with coverage:

```
deno task test:cov
```

Run tests for a specific package:

```
deno test <package-path>
```

## Code Formatting and Linting

Format code:

```
deno fmt
```

Run linter:

```
deno lint
```

Run type checking:

```
deno check
```

Or run all checks at once:

```
deno task precommit
```

## Permissions

When running scripts, Deno may prompt for permissions. Common flags:

- `--allow-read` - Read files
- `--allow-write` - write_to_file files
- `--allow-net` - Network requests

Run tests with all permissions:

```
deno test -A
```
