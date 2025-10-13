# Speed Up MCPC with In-Memory Transport

Connect MCP servers in the same process. No external processes, no network
overhead.

## Why Use It

**Zero overhead**: Same-process communication is instant\
**Simple testing**: No external dependencies to mock\
**Easy embedding**: Integrate MCP directly into your app

## Usage

**Step 1**: Create an MCP server

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const myServer = new McpServer({ name: "my-server", version: "1.0.0" });

myServer.tool(
  "greet",
  "Greet a user",
  { name: "string" },
  ({ name }) => ({
    content: [{ type: "text", text: `Hello, ${name}!` }],
  }),
);
```

**Step 2**: Pass server instance to MCPC

```typescript
import { mcpc } from "@mcpc/core";

const server = await mcpc(
  [{ name: "my-agent", version: "1.0.0" }, { capabilities: { tools: {} } }],
  [{
    name: "greeter",
    description: 'Available tools:\n<tool name="my-server.greet"/>',
    deps: {
      mcpServers: {
        "my-server": {
          transportType: "memory",
          server: myServer, // Pass the server instance
        },
      },
    },
  }],
);
```

## The Advantage

**Other transports** spawn processes or make network calls:

```typescript
deps: {
  mcpServers: {
    "desktop-commander": {
      command: "npx",  // Spawns external process
      args: ["-y", "@wonderwhy-er/desktop-commander"],
      transportType: "stdio"
    }
  }
}
```

**Memory transport** runs in the same process:

```typescript
deps: {
  mcpServers: {
    "my-server": {
      transportType: "memory",
      server: myServerInstance,  // Instant, no overhead
    },
  },
}
```

## Try the Example

```bash
deno run --allow-all packages/core/examples/13-in-memory-transport.ts
```

See the [example code](../../packages/core/examples/13-in-memory-transport.ts)
for a complete working implementation.
