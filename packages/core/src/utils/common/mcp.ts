import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServerConfig, MCPSetting } from "../../service/tools.ts";

import { sanitizePropertyKey } from "./provider.ts";
import { cwd } from "node:process";
import process from "node:process";
import { createHash } from "node:crypto";

/**
 * Creates appropriate transport based on server config definition.
 * Supports: stdio, sse, streamable-http, and in-memory transports.
 *
 * Compatible with multiple IDE/client config formats:
 * - MCPC: explicit "transportType" field
 * - VSCode/Cursor: explicit "type" field
 * - Cline/Claude Desktop: implicit detection (command → stdio, url → http/sse)
 */
function createTransport(def: McpServerConfig):
  | StdioClientTransport
  | StreamableHTTPClientTransport
  | SSEClientTransport
  | InMemoryTransport {
  const defAny = def as any;

  const explicitType = defAny.transportType || defAny.type;

  if (explicitType === "memory") {
    if (!defAny.server) {
      throw new Error(
        "In-memory transport requires a 'server' field with a Server instance",
      );
    }

    const [clientTransport, serverTransport] = InMemoryTransport
      .createLinkedPair();
    defAny.server.connect(serverTransport).catch((err: Error) => {
      console.error("Error connecting in-memory server:", err);
    });
    return clientTransport;
  }

  if (explicitType === "sse") {
    const options: any = {};
    if (defAny.headers) {
      options.requestInit = { headers: defAny.headers };
      options.eventSourceInit = { headers: defAny.headers };
    }
    return new SSEClientTransport(new URL(defAny.url), options);
  }

  if (defAny.url && typeof defAny.url === "string") {
    const options: any = {};
    if (defAny.headers) {
      options.requestInit = { headers: defAny.headers };
    }
    return new StreamableHTTPClientTransport(new URL(defAny.url), options);
  }

  if (explicitType === "stdio" || defAny.command) {
    return new StdioClientTransport({
      command: defAny.command,
      args: defAny.args,
      env: {
        ...(process.env as any),
        ...(defAny.env ?? {}),
      },
      cwd: cwd(),
    });
  }

  throw new Error(
    `Unsupported transport configuration: ${JSON.stringify(def)}`,
  );
}

function defSignature(def: McpServerConfig) {
  const defCopy = { ...def };
  if (
    (defCopy as any).transportType === "memory" || (defCopy as any).transport
  ) {
    return `memory:${Date.now()}:${Math.random()}`;
  }
  return JSON.stringify(defCopy);
}

const shortHash = (s: string) =>
  createHash("sha256").update(s).digest("hex").slice(0, 8);

async function createMcpClient(def: McpServerConfig): Promise<Client> {
  const transport = createTransport(def);
  const client = new Client({
    name: `mcp_${shortHash(defSignature(def))}`,
    version: "1.0.0",
  });
  await client.connect(transport, { timeout: 60_000 * 10 });
  return client;
}

export async function composeMcpDepTools(
  mcpConfig: MCPSetting,
  filterIn?: (params: {
    action: string;
    tool: any;
    mcpName: string;
    toolNameWithScope: string;
    internalToolName: string;
    toolId: string;
  }) => boolean,
): Promise<Record<string, any>> {
  const allTools: Record<string, any> = {};
  const allClients: Record<string, Client> = {};
  const clientsToClose: Client[] = [];

  for (const [name, definition] of Object.entries(mcpConfig.mcpServers)) {
    const def = definition as McpServerConfig;
    if (def.disabled) continue;

    try {
      const client = await createMcpClient(def);
      clientsToClose.push(client);
      allClients[name] = client;

      const { tools } = await client.listTools();

      tools.forEach((tool) => {
        const toolNameWithScope = `${name}.${tool.name}`;
        const internalToolName = tool.name;

        const rawToolId = `${name}_${internalToolName}`;
        const toolId = sanitizePropertyKey(rawToolId);
        if (
          filterIn &&
          !filterIn({
            action: internalToolName,
            tool,
            mcpName: name,
            toolNameWithScope,
            internalToolName,
            toolId,
          })
        ) {
          return;
        }

        const execute = (args: Record<string, unknown>) =>
          allClients[name].callTool(
            { name: internalToolName, arguments: args },
            undefined,
            { timeout: def.toolCallTimeout },
          );

        allTools[toolId] = {
          ...tool,
          execute,
          _originalName: toolNameWithScope,
        };
      });
    } catch (error) {
      console.error(`Error creating MCP client for ${name}:`, error);
    }
  }

  const cleanupClients = async () => {
    await Promise.all(
      clientsToClose.map((client) => {
        try {
          return client.close();
        } catch {
          // ignore
        }
      }),
    );
  };

  return { tools: allTools, clients: allClients, cleanupClients };
}
