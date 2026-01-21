# Example Configurations

This directory contains example configuration files for MCPC CLI.

## Available Configs

### codex-fork.json / codex-fork.md

A full-featured "Codex Fork" agent based on the MCPC documentation example.
Available in both JSON and Markdown formats.

Includes:

- **desktop-commander**: File system operations and terminal execution
- **lsmcp**: Language server features for code navigation
- **github**: GitHub API integration

**Requirements:**

- Set `GITHUB_PERSONAL_ACCESS_TOKEN` environment variable with your GitHub
  Personal Access Token

**How to get a GitHub Personal Access Token:**

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens
   (classic)
2. Generate new token with these scopes:
   - `repo` (Full control of private repositories)
   - `read:org` (Read org and team membership)
   - `user` (Read user profile data)
3. Copy the generated token (starts with `ghp_`)

```bash
# Use JSON config
export GITHUB_PERSONAL_ACCESS_TOKEN="ghp_your_token_here"
mcpc --config-file examples/configs/codex-fork.json

# Or use Markdown config (same agent, different format)
mcpc --config-file examples/configs/codex-fork.md
```

## Remote Loading

After pushing to GitHub, these configs can be loaded via URL:

```bash
# Load simple config from GitHub
export MCPC_CONFIG_URL="https://raw.githubusercontent.com/mcpc-tech/mcpc/main/packages/cli/examples/configs/codex-fork.json"
deno run --allow-all src/bin.ts

# Or use the example script
./examples/05-url-config.sh
```

## Custom Configs

Create your own config based on these examples:

```json
{
  "name": "my-agent",
  "version": "1.0.0",
  "agents": [
    {
      "name": "agent-name",
      "description": "Agent description with <tool> tags",
      "deps": {
        "mcpServers": {
          "server-name": {
            "command": "npx",
            "args": ["-y", "package-name"],
            "transportType": "stdio"
          }
        }
      }
    }
  ]
}
```

See the [main README](../../README.md) for more configuration options.
