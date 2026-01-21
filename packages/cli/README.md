# MCPC CLI

[![NPM Version](https://img.shields.io/npm/v/@mcpc-tech/cli)](https://www.npmjs.com/package/@mcpc-tech/cli)
[![JSR](https://jsr.io/badges/@mcpc/cli)](https://jsr.io/@mcpc/cli)

CLI for running MCPC agentic servers with configuration support.

> **Note:** Published as `@mcpc-tech/cli` on npm and `@mcpc/cli` on JSR.

## Quick Start

```bash
# Install globally (or use npx -y @mcpc-tech/cli instead of mcpc)
npm install -g @mcpc-tech/cli

# Quick wrap: wrap an existing MCP server and run immediately
mcpc --wrap --name "file-manager" \
  --mcp-stdio "npx -y @wonderwhy-er/desktop-commander"

# Full config: load a complete agent configuration
mcpc --config-file ./my-agent.json

# Code execution mode (no MCP server required)
mcpc  # Runs with built-in code_execution mode by default

# Show help
mcpc --help
```

## Usage Modes

### 1. Quick Wrap Mode

The simplest way to get started - wrap existing MCP servers:

```bash
# One-time run (no config saved)
mcpc --wrap --name "my-agent" \
  --mcp-stdio "npx -y @wonderwhy-er/desktop-commander"

# Save to config for reuse
mcpc --add --mcp-stdio "npx -y @wonderwhy-er/desktop-commander"
mcpc  # Loads ~/.mcpc/config.json
```

### 2. Full Configuration Mode

Load complete agent configurations with custom descriptions, tool references,
and execution modes:

```bash
# From JSON file
mcpc --config-file ./agents/codex-fork.json

# From Markdown agent file
mcpc --config-file ./agents/coding-agent.md

# From URL
mcpc --config-url https://example.com/agent-config.json
```

Example JSON configuration:

```json
{
  "name": "my-server",
  "version": "1.0.0",
  "agents": [{
    "name": "codex-fork",
    "description": "A coding agent.\n\nAvailable tools:\n<tool name=\"desktop-commander.read_file\"/>\n<tool name=\"desktop-commander.write_file\"/>",
    "deps": {
      "mcpServers": {
        "desktop-commander": {
          "command": "npx",
          "args": ["-y", "@wonderwhy-er/desktop-commander"],
          "transportType": "stdio"
        }
      }
    },
    "options": {
      "mode": "agentic"
    }
  }]
}
```

### 3. Standalone Mode (No External MCP Servers)

Run with built-in capabilities only, using the `code_execution` mode:

```bash
# Default mode - code execution without external dependencies
mcpc

# Explicit standalone with code execution
mcpc --config '[{"name":null,"options":{"mode":"code_execution"}}]'
```

## Configuration Files

### Supported Formats

- **JSON** (`.json`): Standard configuration format
- **Markdown** (`.md`): Agent definition with YAML front matter (via
  `@mcpc/plugin-markdown-loader`)

You can also use markdown file paths directly in the `agents` array:

```json
{
  "name": "my-server",
  "version": "1.0.0",
  "agents": [
    "./agents/coding-agent.md",
    { "name": "inline-agent", "description": "..." }
  ]
}
```

### Markdown Agent File Format

```markdown
---
name: coding-agent
mode: agentic
deps:
  mcpServers:
    desktop-commander:
      command: npx
      args: ["-y", "@wonderwhy-er/desktop-commander"]
      transportType: stdio
---

# Coding Agent

I am a coding assistant that can read and write files.

Available tools:
<tool name="desktop-commander.read_file"/>
<tool name="desktop-commander.write_file"/>
```

### Loading Configuration

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
- `--mode <mode>` - Execution mode for inline agents (default: `agentic`).
  Markdown agent files define their own mode in frontmatter.

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

#### `ai_sampling`

Autonomous execution using AI SDK with MCP sampling provider.

```bash
mcpc --wrap --mode ai_sampling --name "autonomous-agent" \
  --mcp-stdio "npx -y @wonderwhy-er/desktop-commander"
```

#### `ai_acp`

AI SDK ACP mode for coding agents like Claude Code.

```bash
mcpc --wrap --mode ai_acp --name "coding-agent" \
  --mcp-stdio "npx -y @wonderwhy-er/desktop-commander"
```

#### `code_execution`

Enables code execution capabilities for running code snippets and scripts
through the agent. Requires the `@mcpc-tech/plugin-code-execution` plugin.

```bash
mcpc --wrap --mode code_execution --name "code-runner" \
  --mcp-stdio "npx -y @wonderwhy-er/desktop-commander"
```

> **Note:** Different modes may require specific plugins to be available. The
> `agentic` mode is always available by default. The `code_execution` mode
> requires `@mcpc-tech/plugin-code-execution` which is included by default in
> the CLI.

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
