# oapi-invoker-mcp 🚀

> Say goodbye to repetitive development of "API's API"

<img src="./logo.png" width="300" height="300" alt="oapi-invoker-logo">

`oapi-invoker-mcp` invokes any OpenAPI through Model Context Protocol (MCP) server.

- [x] Easily invoke any OpenAPI service through MCP client 💻
- [x] Support specification patches (e.g., add API descriptions and examples to enhance documentation) 📝
- [x] Support custom authentication protocols, like `Tencent Cloud API Signature V3` 🔐
- [ ] Data encryption/decryption (e.g., authentication headers) 🔒

# Quick Start

## 1. Configure MCP Server in your application:

If you have Node.js installed locally, you can configure:

```json
{
  "mcpServers": {
    "capi-invoker": {
      "command": "npx",
      "args": [
        "-y",
        "deno",
        "run",
        "--allow-all",
        "jsr:@mcpc/oapi-invoker-mcp/bin"
      ],
      "env": {},
      "transportType": "stdio"
    }
  }
}
```

If you have Deno installed locally, you can configure:

```json
{
  "mcpServers": {
    "capi-invoker": {
      "command": "deno",
      "args": ["run", "--allow-all", "jsr:@mcpc/oapi-invoker-mcp/bin"],
      "env": {},
      "transportType": "stdio"
    }
  }
}
```

The above two methods need to supplement the env field as environment variables for running the MCP Server.
