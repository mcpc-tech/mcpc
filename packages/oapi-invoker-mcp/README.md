# oapi-invoker-mcp 🚀

> Say goodbye to repetitive development of "API's API"

<img src="./logo.png" width="300" height="300" alt="oapi-invoker-logo">

`oapi-invoker-mcp` invokes any OpenAPI through Model Context Protocol (MCP) server.

- [x] Easily invoke any OpenAPI service through MCP client 💻
- [x] Support specification patches (e.g., add API descriptions and examples to enhance documentation) 📝
- [x] Support custom authentication protocols, like `Tencent Cloud API Signature V3` 🔐
- [ ] Data encryption/decryption (e.g., authentication headers) 🔒

# Quick Start

For local running, please [install Deno](https://docs.deno.com/runtime/#install-deno)

Then clone this repo with:

```
git clone https://github.com/mcpc-tech/mcpc.git && cd mcpc/packages/oapi-invoker-mcp
```

Configure MCP Server in your application:

```json
{
  "mcpServers": {
    "code-runner": {
      "url": "http://localhost:9000/oapi/sse",
      "transportType": "sse"
    }
  }
}
```

```json
{
  "mcpServers": {
    "code-runner": {
      "command": "deno",
      "args": [
        "run",
        "--allow-all",
        "path_to_mcpc/packages/oapi-invoker-mcp/src/stdio.server.ts"
      ],
      "transportType": "stdio"
    }
  }
}
```
