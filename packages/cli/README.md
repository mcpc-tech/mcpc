# MCPC CLI

[![NPM Version](https://img.shields.io/npm/v/@mcpc-tech/cli)](https://www.npmjs.com/package/@mcpc-tech/cli)
[![JSR](https://jsr.io/badges/@mcpc/cli)](https://jsr.io/@mcpc/cli)

CLI server for MCPC with configuration support.

> **Note:** Published as `@mcpc-tech/cli` on npm and `@mcpc/cli` on JSR.

## Quick Start

```bash
# Install globally (or use npx -y @mcpc-tech/cli instead of mcpc)
npm install -g @mcpc-tech/cli

# Wrap an existing MCP server and run it immediately
mcpc --wrap --name "file-manager" \
  --mcp-stdio "npx -y @wonderwhy-er/desktop-commander"

# Add MCP servers to config, then run separately
mcpc --add --mcp-stdio "npx -y @wonderwhy-er/desktop-commander"
mcpc  # Loads ~/.mcpc/config.json automatically

# Show help
mcpc --help
```

## Wrapping MCP Servers

The simplest way to use MCPC is to wrap existing MCP servers with custom
execution modes:

### One-time Run (no config saved)

```bash
# Wrap and run a single MCP server
mcpc --wrap --name "my-file-manager-agent" \
  --mcp-stdio "npx -y @wonderwhy-er/desktop-commander"

# Wrap multiple servers with different protocols and execution mode
mcpc --wrap --name "file-and-github-agent" --mode code_execution \
  --mcp-stdio "npx -y @wonderwhy-er/desktop-commander" \
  --mcp-http "https://api.github.com/mcp"
```

### Persistent Config (save and reuse)

```bash
# Step 1: Add servers to config
mcpc --add --mcp-stdio "npx -y @wonderwhy-er/desktop-commander"

# Step 2: (Optional) Edit ~/.mcpc/config.json to add headers, env vars, etc.

# Step 3: Run with saved config
mcpc  # Automatically loads ~/.mcpc/config.json
```

The config file lets you add custom headers, environment variables, and other
settings:

```json
{
  "agents": [{
    "deps": {
      "mcpServers": {
        "github": {
          "command": "https://api.github.com/mcp",
          "transportType": "streamable-http",
          "headers": {
            "Authorization": "Bearer YOUR_TOKEN"
          }
        }
      }
    }
  }]
}
```

## Configuration Files

Load config from different sources:

```bash
# From a specific file
mcpc --config-file ./my-config.json

# From a URL
mcpc --config-url https://example.com/config.json

# From URL with custom headers
mcpc --config-url https://api.example.com/config.json \
  -H "Authorization: Bearer token123"

# Inline JSON
mcpc --config '[{"name":"my-agent","description":"..."}]'
```

### Config Priority Order

1. `--config` (inline JSON)
2. `MCPC_CONFIG` environment variable
3. `--config-url` or `MCPC_CONFIG_URL`
4. `--config-file` or `MCPC_CONFIG_FILE`
5. `~/.mcpc/config.json` (user config)
6. `./mcpc.config.json` (local config)

### Environment Variables

Use `$VAR_NAME` syntax in config files:

```json
{
  "agents": [{
    "deps": {
      "mcpServers": {
        "github": {
          "headers": {
            "Authorization": "Bearer $GITHUB_TOKEN"
          }
        }
      }
    }
  }]
}
```

## HTTP Server

Run as an HTTP server instead of stdio:

```bash
deno run -A jsr:@mcpc/cli/server --config-file ./my-config.json
```

## Command Reference

### Main Options

- `--help`, `-h` - Show help message
- `--add` - Add MCP servers to `~/.mcpc/config.json` and exit
- `--wrap` - Wrap and run MCP servers immediately (no config saved)
- `--mcp-stdio <cmd>` - Add stdio MCP server
- `--mcp-http <url>` - Add HTTP MCP server
- `--mcp-sse <url>` - Add SSE MCP server
- `--name <name>` - Custom agent name (default: auto-generated from server
  names)
- `--mode <mode>` - Execution mode (default: `agentic`)

### Execution Modes (`--mode`)

MCPC supports different execution modes that control how the agent processes and
executes tools:

#### `agentic` (default)

Interactive tool execution where the AI agent decides which tools to call and
when. The agent can make multiple tool calls in a conversation-like flow.

```bash
mcpc --wrap --mode agentic --name "smart-assistant" \
  --mcp-stdio "npx -y @wonderwhy-er/desktop-commander"
```

#### `agentic_workflow`

Structured execution with predefined or runtime-generated steps. The agent
follows a workflow pattern with specific actions at each step.

```bash
mcpc --wrap --mode agentic_workflow --name "workflow-processor" \
  --mcp-stdio "npx -y @wonderwhy-er/desktop-commander"
```

#### `code_execution`

Enables code execution capabilities for running code snippets and scripts
through the agent.

```bash
mcpc --wrap --mode code_execution --name "code-runner" \
  --mcp-stdio "npx -y @wonderwhy-er/desktop-commander"
```

> **Note:** Different modes may require specific plugins to be available. The
> `agentic` mode is always available by default.

### Config Options

- `--config <json>` - Inline JSON config
- `--config-url <url>` - Fetch config from URL
- `--config-file <path>` - Load config from file
- `--request-headers <header>`, `-H <header>` - Add HTTP header for URL fetching

## Examples

See the [examples directory](examples/) for complete working examples using the
Codex Fork configuration.

### Required Environment Variables

When using the Codex Fork configuration:

- `GITHUB_PERSONAL_ACCESS_TOKEN` - GitHub Personal Access Token for GitHub MCP
  server

Run the example scripts to see different usage patterns:

```bash
# First, set required environment variables
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

# Example 6: URL config with custom headers
./examples/06-url-with-headers.sh
```

All examples use the same [codex-fork.json](examples/configs/codex-fork.json)
configuration.
