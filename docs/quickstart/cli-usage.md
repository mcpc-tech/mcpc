# CLI Usage Guide

The MCPC CLI provides a convenient way to run MCPC servers by loading
configuration from files or URLs, supporting multiple transport types (stdio,
HTTP, SSE).

## Installation

You can run the CLI directly without installation using `npx`:

```bash
# Show help message
npx -y deno run -A jsr:@mcpc/cli/bin --help

# Run directly from JSR
npx -y deno run -A jsr:@mcpc/cli/bin --config-url <url>
```

Or install it for repeated use:

```bash
# npm
npx jsr add @mcpc/cli
# deno  
deno add jsr:@mcpc/cli
# pnpm
pnpm add jsr:@mcpc/cli
```

## Configuration Methods

The CLI supports multiple ways to load configuration, checked in this order:

1. `--config <json>` - Inline JSON configuration string
2. `--config-url <url>` - Fetch configuration from a URL
3. `--config-file <path>` - Load configuration from a file path
4. Default - Uses `./mcpc.config.json` if it exists

### Command-Line Options

- `--help`, `-h` - Show help message
- `--config <json>` - Inline JSON configuration string
- `--config-url <url>` - Fetch configuration from URL
- `--config-file <path>` - Load configuration from file path
- `--request-headers <header>`, `-H <header>` - Add custom HTTP header for URL
  fetching (can be used multiple times)
  - Format: `"Key: Value"` or `"Key=Value"`

### 1. Inline JSON Configuration

Pass configuration directly as a JSON string:

```bash
npx -y deno run -A jsr:@mcpc/cli/bin --config '{
  "name": "my-agent",
  "version": "1.0.0",
  "agents": [{
    "name": "my-agent",
    "description": "My agent description",
    "deps": {
      "mcpServers": {
        "desktop-commander": {
          "command": "npx",
          "args": ["-y", "@wonderwhy-er/desktop-commander@latest"],
          "transportType": "stdio"
        }
      }
    }
  }]
}'
```

### 2. Configuration from URL

Load configuration from a remote URL (useful for sharing configurations):

```bash
# Load from GitHub
npx -y deno run -A jsr:@mcpc/cli/bin --config-url \
  "https://raw.githubusercontent.com/mcpc-tech/mcpc/main/packages/cli/examples/configs/codex-fork.json"

# Load from URL with custom headers (e.g., authentication)
npx -y deno run -A jsr:@mcpc/cli/bin \
  --config-url "https://api.example.com/config.json" \
  -H "Authorization: Bearer token123" \
  -H "X-Custom-Header: value"

# Multiple headers can be specified
npx -y deno run -A jsr:@mcpc/cli/bin \
  --config-url "https://private-api.example.com/config.json" \
  --request-headers "Authorization: Bearer ${API_TOKEN}" \
  --request-headers "Accept: application/json"
```

### 3. Configuration from File

Load configuration from a local file:

```bash
npx -y deno run -A jsr:@mcpc/cli/bin --config-file ./my-config.json
```

### 4. Default Configuration

If no configuration is specified, the CLI looks for `./mcpc.config.json`:

```bash
# Uses ./mcpc.config.json if it exists
npx -y deno run -A jsr:@mcpc/cli/bin
```

## Environment Variable Substitution

Configuration files support environment variable substitution using `$VAR_NAME`
syntax:

```json
{
  "name": "my-agent",
  "agents": [{
    "deps": {
      "mcpServers": {
        "github": {
          "transportType": "streamable-http",
          "url": "https://api.githubcopilot.com/mcp/",
          "headers": {
            "Authorization": "Bearer $GITHUB_PERSONAL_ACCESS_TOKEN"
          }
        }
      }
    }
  }]
}
```

Set the environment variable before running:

```bash
export GITHUB_PERSONAL_ACCESS_TOKEN="ghp_your_token_here"
npx -y deno run -A jsr:@mcpc/cli/bin --config-file ./config.json
```

## Transport Types

### STDIO Transport (Default)

Communicates via standard input/output, suitable for integration with AI clients
like Claude Desktop:

```bash
npx -y deno run -A jsr:@mcpc/cli/bin --config-file ./config.json
```

### HTTP Server

Run as an HTTP server with SSE (Server-Sent Events) support:

```bash
# Using the server command
npx -y deno run -A jsr:@mcpc/cli/server --config-file ./config.json

# Server will start on http://localhost:3000 by default
```

Access endpoints:

- `GET /health` - Health check
- `POST /messages` - Send messages to the agent
- `GET /sse` - Server-sent events stream
- `GET /docs` - OpenAPI documentation

## Complete Example: Codex Fork Agent

Here's a complete example that creates a coding assistant agent:

### Step 1: Create Configuration File

Create `codex-fork.json`:

```json
{
  "name": "codex-fork-agent",
  "version": "0.1.0",
  "capabilities": {
    "tools": {},
    "sampling": {}
  },
  "agents": [
    {
      "name": "codex-fork-agent",
      "description": "You are a coding assistant with advanced capabilities...\n\nAvailable tools:\n<tool name=\"desktop-commander.start_process\"/>\n<tool name=\"desktop-commander.read_file\"/>\n<tool name=\"desktop-commander.write_file\"/>",
      "options": {
        "mode": "agentic"
      },
      "deps": {
        "mcpServers": {
          "desktop-commander": {
            "command": "npx",
            "args": ["-y", "@wonderwhy-er/desktop-commander@latest"],
            "transportType": "stdio"
          },
          "github": {
            "transportType": "streamable-http",
            "url": "https://api.githubcopilot.com/mcp/",
            "headers": {
              "Authorization": "Bearer $GITHUB_PERSONAL_ACCESS_TOKEN"
            }
          }
        }
      }
    }
  ]
}
```

### Step 2: Set Environment Variables

```bash
export GITHUB_PERSONAL_ACCESS_TOKEN="ghp_your_token_here"
```

### Step 3: Run the Server

```bash
# Run with stdio transport
npx -y deno run -A jsr:@mcpc/cli/bin --config-file ./codex-fork.json

# Or run as HTTP server
npx -y deno run -A jsr:@mcpc/cli/server --config-file ./codex-fork.json
```

## Using with AI Clients

```json
{
  "mcpServers": {
    "my-agent": {
      "command": "npx",
      "args": [
        "-y",
        "deno",
        "run",
        "-A",
        "jsr:@mcpc/cli/bin",
        "--config-file",
        "/path/to/config.json"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

## Configuration File Structure

A complete configuration file structure:

```json
{
  "name": "server-name",
  "version": "1.0.0",
  "capabilities": {
    "tools": {},
    "sampling": {}
  },
  "agents": [
    {
      "name": "agent-name",
      "description": "Agent description with <tool name='server.tool'/> references",
      "options": {
        "mode": "agentic"
      },
      "deps": {
        "mcpServers": {
          "server-name": {
            "command": "npx",
            "args": ["-y", "package-name"],
            "transportType": "stdio"
          },
          "http-server": {
            "transportType": "streamable-http",
            "url": "https://api.example.com/mcp/",
            "headers": {
              "Authorization": "Bearer $API_TOKEN"
            }
          }
        }
      }
    }
  ]
}
```

## Troubleshooting

### Show Help

If you're unsure about available options:

```bash
npx -y deno run -A jsr:@mcpc/cli/bin --help
```

### Permission Denied

Make sure to include the `-A` flag for all permissions:

```bash
npx -y deno run -A jsr:@mcpc/cli/bin --config-file ./config.json
```

### Environment Variables Not Working

Ensure environment variables are exported before running:

```bash
export MY_VAR="value"
npx -y deno run -A jsr:@mcpc/cli/bin --config-file ./config.json
```

### Configuration Not Found

Check that the file path is correct and the file exists:

```bash
ls -l ./config.json
npx -y deno run -A jsr:@mcpc/cli/bin --config-file ./config.json
```

## Next Steps

- See [complete configuration examples](../../packages/cli/examples/configs/)
- Learn about
  [creating your first agentic MCP](./create-your-first-agentic-mcp.md)
- Explore
  [example configurations](../../packages/cli/examples/configs/codex-fork.json)
