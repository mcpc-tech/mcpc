# MCPC CLI

[![NPM Version](https://img.shields.io/npm/v/@mcpc-tech/cli)](https://www.npmjs.com/package/@mcpc-tech/cli)
[![JSR](https://jsr.io/badges/@mcpc/cli)](https://jsr.io/@mcpc/cli)

CLI server for MCPC with configuration support.

> **Note:** This package is published as `@mcpc-tech/cli` on npm and `@mcpc/cli`
> on JSR.

## Quick Start

```bash
# Using npm
npx -y @mcpc-tech/cli --help

# Using JSR
npx -y deno run -A jsr:@mcpc/cli/bin --help

# Load configuration from URL
npx -y deno run -A jsr:@mcpc/cli/bin --config-url \
  "https://raw.githubusercontent.com/mcpc-tech/mcpc/main/packages/cli/examples/configs/codex-fork.json"
```

## Configuration

Load configuration using command-line arguments:

- `--help`, `-h` - Show help message
- `--config <json>` - Inline JSON configuration string
- `--config-url <url>` - Fetch from URL (e.g., GitHub raw)
- `--config-file <path>` - Path to configuration file
- `--request-headers <header>`, `-H <header>` - Add custom HTTP header for URL
  fetching (can be used multiple times)
- `--agent-name <name>` - Compose an agent from CLI flags with no config file
- `--agent-description <text>` - Set the inline agent description
- `--agent-deps <json>` - Provide agent dependency JSON
  (`ComposeDefinition['deps']`)
- `--mcp <name=json>` - Add an MCP dependency (repeatable)
- `--agent-plugin <value>` - Add a plugin (repeatable, accepts JSON or module
  path)
- `--agent-options <json>` - Provide agent options JSON (`mode`,
  `samplingConfig`, etc.)
- `--agent-ref <xml>` - Append `<tool name="..."/>` references to `options.refs`
- `--server-name <name>` / `--server-version <version>` - Override server
  metadata
- `--server-capabilities <json>` - Override server capabilities JSON
- No arguments - Uses `./mcpc.config.json` if available

## Usage

**Show help:**

```bash
npx -y deno run -A jsr:@mcpc/cli/bin --help
```

**Inline JSON config:**

```bash
npx -y deno run -A jsr:@mcpc/cli/bin --config '[{"name":"my-agent","description":"..."}]'
```

**From URL:**

```bash
npx -y deno run -A jsr:@mcpc/cli/bin --config-url https://example.com/config.json
```

**From URL with custom headers:**

```bash
npx -y deno run -A jsr:@mcpc/cli/bin \
  --config-url https://api.example.com/config.json \
  -H "Authorization: Bearer token123" \
  -H "X-Custom-Header: value"
```

**From file:**

```bash
npx -y deno run -A jsr:@mcpc/cli/bin --config-file ./my-config.json
```

**Default (uses ./mcpc.config.json):**

```bash
npx -y deno run -A jsr:@mcpc/cli/bin
```

**Inline agent without a config file:**

```bash
npx -y deno run -A jsr:@mcpc/cli/bin \
  --agent-name codex-inline \
  --agent-description "Code agent wrapping desktop commander" \
  --mcp 'desktop-commander={"command":"npx","args":["-y","@wonderwhy-er/desktop-commander@latest"],"transportType":"stdio"}' \
  --agent-plugin '@mcpc/core/plugins/large-result?maxSize=12000' \
  --agent-options '{"mode":"agentic"}'
```

Supply `--mcp` multiple times to add more dependencies or combine it with
`--agent-deps` for full control of the `deps` structure.

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
npx -y deno run -A jsr:@mcpc/cli/server --config-file ./my-config.json
```

## Examples

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
