# MCPC CLI

CLI server for MCPC with configuration support.

## Configuration

Load configuration using command-line arguments:

- `--config <json>` - Inline JSON configuration string
- `--config-url <url>` - Fetch from URL (e.g., GitHub raw)
- `--config-file <path>` - Path to configuration file
- No arguments - Uses `./mcpc.config.json` if available

## Usage

**Inline JSON config:**

```bash
deno run --allow-all src/bin.ts --config '[{"name":"my-agent","description":"..."}]'
```

**From URL:**

```bash
deno run --allow-all src/bin.ts --config-url https://example.com/config.json
```

**From file:**

```bash
deno run --allow-all src/bin.ts --config-file ./my-config.json
```

**Default (uses ./mcpc.config.json):**

```bash
deno run --allow-all src/bin.ts
```

**Environment variable substitution:**

Config files support `$ENV_VAR_NAME` syntax:

```json
{
  "agents": [{
    "deps": {
      "mcpServers": {
        "github": {
          "headers": {
            "Authorization": "Bearer $GITHUB_PERSONAL_ACCESS_TOKEN"
          }
        }
      }
    }
  }]
}
```

**HTTP server:**

```bash
deno run --allow-all src/server.ts --config-file ./my-config.json
```

## Examples

### Required Environment Variables

When using the Codex Fork configuration:

- `GITHUB_PERSONAL_ACCESS_TOKEN` - GitHub Personal Access Token for GitHub MCP
  server

Run the example scripts to see different usage patterns:

```bash
# P
export GITHUB_PERSONAL_ACCESS_TOKEN="github_pat_your_token"

# Example 1: Inline configuration
./examples/01-env-var.sh

# Example 2: Environment variable substitution
./examples/02-env-substitution.sh

# Example 3: Configuration from file
./examples/03-config-file.sh

# Example 4: HTTP server
./examples/04-http-server.sh

# Example 5: Remote URL config
./examples/05-url-config.sh
```

All examples use the same [codex-fork.json](examples/configs/codex-fork.json)
configuration.
