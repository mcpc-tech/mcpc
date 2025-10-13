# FAQ

## Frequently Asked Questions

### Q1: What is an agentic MCP tool?

An MCP tool that acts like an agent. When called, it internally orchestrates
complex workflows by calling its dependent MCP tools in multiple steps to
complete the task.

**Regular MCP tool**: "Read this file" → returns file content\
**Agentic MCP tool**: "Analyze this codebase" → internally calls dependent MCP
tools (file-reader, test-runner, dependency-checker) in multiple steps → returns
comprehensive analysis

> 📖 **Learn More**: See [Agentic MCP Tools](../learn-more/agentic-mcp-tools.md)
> for technical details.

### Q2: Why build agentic MCP tools instead of agents with LLMs built in?

**Portability**: Write once, run everywhere. Your agent works in Claude Desktop,
VS Code, Cursor, and any future MCP client without modification.

**Interoperability**: MCP tools compose naturally. Your coding agent can work
alongside file managers, web scrapers, and API integrators. Embedded LLM agents
are isolated islands.

> 📖 **Learn More**: See
> [Achieving Agent Interoperability](../learn-more/achieving-agent-interoperability.md)
> for detailed technical explanation.

### Q3: What's the difference between "agentic" mode and "sampling" mode?

**Agentic Mode**: LLM calls tools step by step. You see each action.

**Sampling Mode**: Agent runs autonomously in one call. Only works in VS
Code/compatible clients.

### Q4: How do I reference MCP tools in my agent description?

Use `<tool name="server.toolname" />` syntax:

```xml
<tool name="desktop-commander.execute_command" />
<tool name="github.create_pull_request" />
```

That's it. The agent can now call these tools.

### Q5: What transport types does MCPC support?

All MCP transports work:

- **stdio**: Spawns external processes
- **streamable-http**: HTTP-based communication
- **sse**: Server-Sent Events
- **memory**: In-memory transport for same-process communication

> **Performance Tip**: If MCPC feels slow, try using `memory` transport.
> Connecting multiple MCP servers has overhead - memory transport eliminates it.

> **Learn More**: See
> [Speed Up MCPC with In-Memory Transport](./learn-more/speed-up-with-in-memory-transport.md)
> for detailed examples and use cases.
