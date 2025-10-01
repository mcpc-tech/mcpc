# Example Configurations

This directory contains example configuration files for MCPC CLI.

## Available Configs

### codex-fork.json

A full-featured "Codex Fork" agent based on the MCPC documentation example.

Includes:

- **desktop-commander**: File system operations and terminal execution
- **lsmcp**: Language server features for code navigation
- **github**: GitHub API integration

**Requirements:**

- Set `GITHUB_MCP_PAT` environment variable with your GitHub token

```bash
# Use with environment variable substitution
export GITHUB_MCP_PAT="your-github-token-here"
export MCPC_CONFIG_FILE=examples/configs/codex-fork.json
deno run --allow-all src/bin.ts
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
