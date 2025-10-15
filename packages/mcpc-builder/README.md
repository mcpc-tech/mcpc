# MCPC Builder

[![JSR](https://jsr.io/badges/@mcpc/builder)](https://jsr.io/@mcpc/builder)
[![npm](https://img.shields.io/npm/v/@mcpc-tech/builder)](https://www.npmjs.com/package/@mcpc-tech/builder)

An MCP server that exposes the [mcpc.tech](https://mcpc.tech) registry as tools,
allowing AI assistants to programmatically search for MCP servers and compose
configurations.

## Features

### 🔍 Discovery Tools

- **search_mcp_servers** - Search the MCP registry by query (returns formatted
  table)
- **get_env_var_schemas** - Get environment variable requirements for servers

### 🛠️ Configuration Tools

- **compose_mcpc_config** - Generate agentic MCPC configurations

### 🤖 MCPC Builder Agent

An agentic MCP server that uses the mcpc-builder tools to help discover and
compose MCP servers.

**Features:**

- Interactive server discovery
- Environment variable checking
- Automated configuration generation
- Uses in-memory transport for zero-overhead performance

See [Usage as Agent](#usage-as-agent) below for details.

## Installation

### With Claude Code

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcpc-builder": {
      "command": "npx",
      "args": ["-y", "@mcpc-tech/builder"]
    }
  }
}
```

### Direct Usage

Run the server directly:

```bash
npx -y @mcpc-tech/builder
```

### As a Library

Import and use the server components:

```typescript
import { createServer } from "@mcpc-tech/builder";

const server = createServer();
// ... connect to your transport
```

## Usage Examples

### As an MCP Tools Server

```bash
npx -y @mcpc-tech/builder
```

Use the tools from AI assistants like Claude to search and compose MCP servers.

### As an Agentic Assistant

Run the agent for interactive help:

```bash
npx -y @mcpc-tech/builder mcpc-builder-agent
```

Or add to Claude Desktop:

```json
{
  "mcpServers": {
    "mcpc-builder-agent": {
      "command": "npx",
      "args": ["-y", "@mcpc-tech/builder", "mcpc-builder-agent"]
    }
  }
}
```

The agent helps you discover servers, check requirements, and generate MCPC
configurations.

## API Reference

### search_mcp_servers

Search for MCP servers in the registry.

**Parameters:**

- `query` (string, required) - Search query
- `limit` (number, optional) - Max results (default: 10)
- `offset` (number, optional) - Pagination offset (default: 0)

**Returns:** List of matching servers with basic information

### get_env_var_schemas

Get environment variable schemas for servers.

**Parameters:**

- `serverNames` (string[], required) - Servers to get env vars for

**Returns:** Environment variable requirements and descriptions

### compose_mcpc_config

Generate an MCPC (agentic) configuration.

**Parameters:**

- `serverName` (string, required) - Name for your agentic server
- `toolName` (string, required) - Name for the agent tool
- `description` (string, required) - What the agent does
- `serverDeps` (string[], required) - MCP servers to compose
- `mode` (string, optional) - "agentic" or "agentic_workflow" (default:
  "agentic")
- `enableSampling` (boolean, optional) - Enable autonomous mode (default: false)
- `userConfigs` (object, optional) - Environment variables per server

**Returns:** Complete MCPC configuration JSON

## Development
