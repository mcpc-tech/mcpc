"""
KISS Composable MCP server for Python.

This module mirrors the core idea of mcpc "compose dependent MCPs and expose
their tools through a single server" using the MCP Python SDK.

Design goals (KISS):
- Simple, readable code
- Minimal features to be useful
- No complex parsing or heavy abstractions

Key features implemented:
- Compose multiple dependent MCP servers (stdio or streamable-http)
- List and expose their tools under unique names: "<dep>_<tool>"
- Support selecting/overriding tools via simple <tool .../> tags in description
  - name: "dep.__ALL__" to include all of a dependency, or "dep.tool"
  - description: override the listed description
  - hide: if present, tool is not listed but remains callable
- Forward tool calls to the correct dependency and return results

Non-goals (defer for now):
- Agentic/sampling/workflow helpers
- Internal tool schema inspection and tag rewriting

Usage (stdio):
  from composable import mcpc, ComposeDefinition
  import asyncio

  async def main():
      server = await mcpc(
          server_conf=(
              {"name": "my-agent", "version": "0.1.0"},
              {"capabilities": {"tools": {"listChanged": True}}},
          ),
          compose_conf=[
              ComposeDefinition(
                  name="example",
                  description="Compose example <tool name=\"echo.__ALL__\" />",
                  deps={
                      "mcpServers": {
                          "echo": {"transportType": "stdio", "command": "uv", "args": ["run", "examples/snippets/servers/direct_execution.py"]},
                      }
                  },
              )
          ],
      )
      await server.run_stdio()

  asyncio.run(main())
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import asyncio
import os
import re

import mcp.server.stdio
import mcp.types as types
from mcp.server.lowlevel import NotificationOptions, Server
from mcp.server.models import InitializationOptions
from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.client.streamable_http import streamablehttp_client


# ------------------------------
# Config models (simple, explicit)
# ------------------------------


@dataclass
class StdioConfig:
    transportType: str  # "stdio"
    command: str
    args: Optional[List[str]] = None
    env: Optional[Dict[str, str]] = None


@dataclass
class StreamableHTTPConfig:
    # For simplicity we accept either "streamable-http" or "sse" style url config
    url: str
    transportType: str | None = None  # optional, we'll auto-detect by presence of url


McpServerConfig = StdioConfig | StreamableHTTPConfig


@dataclass
class McpSettings:
    mcpServers: Dict[str, McpServerConfig]


@dataclass
class ComposeDefinition:
    name: str
    description: str
    deps: Optional[McpSettings] = None
    options: Optional[Dict[str, Any]] = None


# ------------------------------
# Simple <tool .../> tag parser
# ------------------------------


@dataclass
class ToolTag:
    name: str
    description: Optional[str]
    hide: bool


def parse_tool_tags(description: str) -> List[ToolTag]:
    """Parse <tool .../> tags with minimal logic.

    Supported attributes: name (required), description (optional), hide (flag)
    Examples:
      <tool name="dep.__ALL__" />
      <tool name="dep.tool" description="Better desc" />
      <tool name="dep.tool" hide />
    """

    tags: List[ToolTag] = []
    # naive regex for self-closing tags
    for m in re.finditer(r"<tool\s+([^>]*)/>", description):
        attrs = m.group(1)
        name_m = re.search(r'name\s*=\s*"([^"]+)"', attrs)
        desc_m = re.search(r'description\s*=\s*"([^"]+)"', attrs)
        hide = bool(re.search(r"\bhide\b", attrs))
        if name_m:
            tags.append(
                ToolTag(name=name_m.group(1), description=desc_m.group(1) if desc_m else None, hide=hide)
            )
    return tags


# ------------------------------
# Composed server
# ------------------------------


class ComposedServer:
    """Low-level MCP server that composes dependent servers.

    Keeps it simple: connect to deps at startup, list tools, expose with renamed
    identifiers, and forward calls.
    """

    def __init__(
        self,
        server_name: str,
        server_version: str = "0.1.0",
        capabilities: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.server_name = server_name
        self.server_version = server_version
        self.server = Server(server_name)
        self.capabilities = capabilities or {}

        # Dep name -> client session and list of tools
        self._sessions: Dict[str, ClientSession] = {}
        # Exposed name -> (dep name, remote tool name)
        self._tool_map: Dict[str, Tuple[str, str]] = {}
        # Exposed tools to list (respecting hide/description overrides)
        self._listed_tools: Dict[str, types.Tool] = {}
        # Allow dot/underscore resolution
        self._name_alias: Dict[str, str] = {}

        # Register handlers
        self.server.list_tools()(self._handle_list_tools)  # type: ignore[misc]
        self.server.call_tool()(self._handle_call_tool)  # type: ignore[misc]

    # ---------- composition ----------
    async def compose(self, definitions: List[ComposeDefinition]) -> None:
        for d in definitions:
            tags = parse_tool_tags(d.description)
            selection_present = len(tags) > 0

            if not d.deps or not d.deps.mcpServers:
                continue

            for dep_name, conf in d.deps.mcpServers.items():
                session = await self._connect_dep(dep_name, conf)
                tools_resp = await session.list_tools()

                for t in tools_resp.tools:
                    exposed_name = f"{dep_name}_{t.name}"
                    dot_name = f"{dep_name}.{t.name}"

                    include = True
                    override_desc: Optional[str] = None
                    hidden = False

                    if selection_present:
                        include = False
                        for tag in tags:
                            if tag.name == f"{dep_name}.__ALL__" or tag.name == dot_name or tag.name == exposed_name:
                                include = True
                                if tag.description:
                                    override_desc = tag.description
                                if tag.hide:
                                    hidden = True
                                break

                    if not include:
                        continue

                    # Map names
                    self._tool_map[exposed_name] = (dep_name, t.name)
                    self._name_alias[dot_name] = exposed_name
                    self._name_alias[exposed_name] = exposed_name

                    # Prepare listed tool (respect hide)
                    if not hidden:
                        # Copy with overridden name/description, keep schemas
                        listed = types.Tool(
                            name=exposed_name,
                            description=override_desc or t.description,
                            inputSchema=t.inputSchema,
                            outputSchema=getattr(t, "outputSchema", None),
                            annotations=getattr(t, "annotations", None),
                            title=getattr(t, "title", None),
                        )
                        self._listed_tools[exposed_name] = listed

    async def _connect_dep(self, dep_name: str, conf: McpServerConfig) -> ClientSession:
        if isinstance(conf, StdioConfig) or getattr(conf, "transportType", None) == "stdio":
            params = StdioServerParameters(
                command=conf.command, args=conf.args or [], env=conf.env or {}
            )

            # stdio_client is an async context manager; keep it open for server lifetime.
            # We'll create, initialize, and store the session and the underlying streams.
            read: Any
            write: Any
            cm = stdio_client(params)
            read, write = await cm.__aenter__()
            session = ClientSession(read, write)
            await session.initialize()
            self._sessions[dep_name] = session

            # Ensure we close when server shuts down
            async def _cleanup() -> None:
                try:
                    await session.close()
                finally:
                    await cm.__aexit__(None, None, None)

            # Attach to server.on_close via a simple hook using asyncio.Finalize style
            self._register_cleanup(_cleanup)
            return session

        # Default to streamable-http if url is present
        url = getattr(conf, "url", None)
        if url:
            cm = streamablehttp_client(url)
            read, write, _ = await cm.__aenter__()
            session = ClientSession(read, write)
            await session.initialize()
            self._sessions[dep_name] = session

            async def _cleanup() -> None:
                try:
                    await session.close()
                finally:
                    await cm.__aexit__(None, None, None)

            self._register_cleanup(_cleanup)
            return session

        raise ValueError(f"Unsupported config for dep {dep_name}: {conf}")

    def _register_cleanup(self, coro_fn):
        # Very simple: attach a one-time task after run completes. We'll run cleanups at the end of run_stdio.
        if not hasattr(self, "_cleanups"):
            self._cleanups: List[Any] = []
        self._cleanups.append(coro_fn)

    # ---------- handlers ----------
    async def _handle_list_tools(self) -> List[types.Tool]:
        return list(self._listed_tools.values())

    async def _handle_call_tool(self, name: str, arguments: Dict[str, Any]) -> Any:
        resolved = self._name_alias.get(name, name)
        mapping = self._tool_map.get(resolved)
        if not mapping:
            raise ValueError(f"Unknown tool: {name}")
        dep_name, remote_tool = mapping
        session = self._sessions.get(dep_name)
        if not session:
            raise RuntimeError(f"Dependency session closed: {dep_name}")

        result = await session.call_tool(remote_tool, arguments)

        # Prefer returning structured data when available; else pass content
        if getattr(result, "structuredContent", None) is not None:
            return result.structuredContent
        return result.content

    # ---------- run helpers ----------
    async def run_stdio(self) -> None:
        async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
            await self.server.run(
                read_stream,
                write_stream,
                InitializationOptions(
                    server_name=self.server_name,
                    server_version=self.server_version,
                    capabilities=self.server.get_capabilities(
                        notification_options=NotificationOptions(),
                        experimental_capabilities=self.capabilities or {},
                    ),
                ),
            )
        # Run cleanups (best-effort)
        for c in getattr(self, "_cleanups", []):
            try:
                await c()
            except Exception:
                pass


# ------------------------------
# Public factory (aligns with TS signature loosely)
# ------------------------------


async def mcpc(
    server_conf: Tuple[Dict[str, Any], Dict[str, Any]] | None = None,
    compose_conf: Optional[List[ComposeDefinition]] = None,
    setup_callback: Optional[Any] = None,
) -> ComposedServer:
    server_info = server_conf[0] if server_conf else {"name": "mcpc-py", "version": "0.1.0"}
    caps = server_conf[1] if server_conf else {"capabilities": {"tools": {"listChanged": True}}}

    composed = ComposedServer(
        server_name=server_info.get("name", "mcpc-py"),
        server_version=server_info.get("version", "0.1.0"),
        capabilities=caps.get("capabilities", {}),
    )

    if setup_callback:
        maybe = setup_callback(composed)
        if asyncio.iscoroutine(maybe):
            await maybe

    if compose_conf:
        await composed.compose(compose_conf)
    return composed
