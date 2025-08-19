MCPC Python (KISS) - Composable MCP server

Simple Python library that composes multiple MCP servers and re-exports their
tools via one server using the MCP Python SDK.

Key points

- Uses uv and official python-sdk
- Exposes tools with names like "dep_tool"
- Optional selection/override via <tool .../> tags in description

Install (dev)

- Ensure uv is installed

Library usage from mcpc_py import mcpc, ComposeDefinition, StdioConfig,
McpSettings import asyncio

async def main(): server = await mcpc( server_conf=( {"name": "my-agent",
"version": "0.1.0"}, {"capabilities": {"tools": {"listChanged": True}}}, ),
compose_conf=[ ComposeDefinition( name="example", description='Compose
<tool name="echo.__ALL__" />', deps=McpSettings( mcpServers={ "echo":
StdioConfig(transportType="stdio", command="uv", args=["run",
"examples/snippets/servers/direct_execution.py"], env={}), } ), ) ], ) await
server.run_stdio()

asyncio.run(main())

Notes

- dot and underscore names are accepted (dep.tool or dep_tool) when calling
  tools
- Hidden tools via <tool name="dep.tool" hide /> remain callable but not listed

Examples

- See `mcpc.py/examples`:
  - `compose_stdio.py`: compose the leaf server by stdio
  - `compose_streamable.py`: compose a remote Streamable HTTP server by URL

Run (fish shell)

```fish
# Use the mcpc.py project so uv installs dependencies from mcpc.py/pyproject.toml

# basic composition (edit the path to your stdio MCP server in the script)
uv run --project mcpc.py mcpc.py/examples/01_basic_composition.py

# aggregator (stdio)
uv run --project mcpc.py mcpc.py/examples/compose_stdio.py

# aggregator composing a streamable HTTP server
uv run --project mcpc.py mcpc.py/examples/compose_streamable.py
```
