# MCPC CLI

CLI server for MCPC with configuration support.

## Configuration

Load configuration from (in priority order):

1. `MCPC_CONFIG` - JSON string
2. `MCPC_CONFIG_URL` - Fetch from URL
3. `MCPC_CONFIG_FILE` - Path to config file
4. `./mcpc.config.json` - Default file

## Usage

**With environment variable:**

```bash
export MCPC_CONFIG='[{"name":"my-agent","description":"...","deps":{...}}]'
deno run --allow-all src/bin.ts
```

**With URL (e.g., GitHub raw):**

```bash
export MCPC_CONFIG_URL='https://raw.githubusercontent.com/user/repo/main/mcpc.config.json'
deno run --allow-all src/bin.ts
```

**With config file:**

```json
// mcpc.config.json
{
  "name": "my-server",
  "version": "1.0.0",
  "agents": [
    {
      "name": "my-agent",
      "description": "Agent with API key: $API_KEY",
      "deps": { "mcpServers": {} }
    }
  ]
}
```

```bash
export API_KEY="secret123"
deno run --allow-all src/bin.ts
```

> **Note:** Config files support `$ENV_VAR_NAME` syntax for environment variable
> substitution.

**HTTP server:**

```bash
deno run --allow-all src/server.ts  # Runs on port 9000
```

## Claude Desktop

```json
{
  "mcpServers": {
    "mcpc": {
      "command": "deno",
      "args": ["run", "--allow-all", "/path/to/src/bin.ts"],
      "env": {
        "MCPC_CONFIG": "[{\"name\":\"agent\",\"description\":\"...\",\"deps\":{...}}]"
      }
    }
  }
}
```

## Examples

Run the example scripts to see different configuration methods:

```bash
# Example 1: Environment variable config
./examples/01-env-var.sh

# Example 2: Environment variable substitution
./examples/02-env-substitution.sh

# Example 3: Config file
./examples/03-config-file.sh

# Example 4: HTTP server
./examples/04-http-server.sh

# Example 5: Remote URL config (after pushing to GitHub)
./examples/05-url-config.sh
```

See [examples/configs/](examples/configs/) for pre-made configuration files
including a full Codex Fork example.
