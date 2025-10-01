# FAQ

## Frequently Asked Questions

### Q1: What's the difference between "agentic" mode and "sampling" mode in MCPC?

**Agentic Mode (Default):** Works through standard, interactive calls where the
LLM explicitly invokes each tool with distinct arguments. The agent makes
deliberate tool calls step by step, allowing for full control and transparency
of each action.

**Sampling Mode (Experimental):** Uses a client-side feature that leverages
sampling to generate tool calls by requesting responses from the client's local
LLM. This creates a "mini-agent" that operates inside the tool and requires a
compatible client like VS Code Copilot. A single call to the agentic tool
initiates an LLM request loop using the client's LLM.

### Q2: How do I reference existing MCP tools in my agent description?

You can reference MCP tools using XML-like syntax in your agent description:

```xml
<tool name="server_name.tool_name" />
<tool name="desktop-commander.exec" />
<tool name="github.createPullRequest" />
```

The `<tool>` tag supports advanced properties:

- **name**: Defines which tool to select from a dependent MCP server (syntax:
  `{mcp_server_name}.{tool_name}`)
- **global**: (boolean, default false) When true, exposes tools in the MCP tools
  scope instead of keeping them internal
- **hide**: (boolean, default false) Commonly used when overriding tools with
  custom properties or results

### Q3: What MCP transport types does MCPC support?

MCPC offers full support for all MCP transport protocols:

- **stdio**: Standard input/output transport (most common)
- **sse**: Server-Sent Events transport
- **streamable-http**: HTTP-based transport for web APIs

Example configurations:

```typescript
const deps = {
  mcpServers: {
    "local-tool": {
      command: "npx",
      args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
      transportType: "stdio",
    },
    "web-api": {
      transportType: "streamable-http",
      url: "https://api.example.com/mcp/",
      headers: { "Authorization": "Bearer ${input:api_token}" },
    },
  },
};
```
