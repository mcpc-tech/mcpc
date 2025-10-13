import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type {
  McpSettingsSchema,
  ServerConfigSchema,
} from "../../service/tools.ts";
import type z from "zod";
import { smitheryToolNameCompatibale } from "./registory.ts";
import { sanitizePropertyKey } from "./provider.ts";
import { cwd } from "node:process";
import process from "node:process";
import { createHash } from "node:crypto";

type MCPClientPoolEntry = {
  client: Client;
  refCount: number;
};

const mcpClientPool = new Map<string, MCPClientPoolEntry>();
const mcpClientConnecting = new Map<string, Promise<Client>>();

const shortHash = (s: string) =>
  createHash("sha256").update(s).digest("hex").slice(0, 8);

function defSignature(
  def: z.input<typeof ServerConfigSchema> | z.infer<typeof ServerConfigSchema>,
) {
  // KISS: stringify full definition for a stable signature
  // Handle circular references from InMemoryTransport or other objects
  const defCopy = { ...def };

  // For in-memory transport, create a unique signature without circular refs
  if (
    (defCopy as any).transportType === "memory" || (defCopy as any).transport
  ) {
    return `memory:${Date.now()}:${Math.random()}`;
  }

  return JSON.stringify(defCopy);
}

/**
 * Creates appropriate transport based on server config definition.
 * Supports: stdio, sse, streamable-http, and in-memory transports.
 *
 * Compatible with multiple IDE/client config formats:
 * - MCPC: explicit "transportType" field
 * - VSCode/Cursor: explicit "type" field
 * - Cline/Claude Desktop: implicit detection (command → stdio, url → http/sse)
 */
function createTransport(
  def: z.input<typeof ServerConfigSchema> | z.infer<typeof ServerConfigSchema>,
):
  | StdioClientTransport
  | StreamableHTTPClientTransport
  | SSEClientTransport
  | InMemoryTransport {
  const defAny = def as any;

  // Normalize transport type from different IDE formats
  // Priority: transportType (MCPC) → type (VSCode/Cursor) → implicit detection (Cline)
  const explicitType = defAny.transportType || defAny.type;

  // Check for in-memory transport - user provides a Server instance
  if (explicitType === "memory") {
    if (!defAny.server) {
      throw new Error(
        "In-memory transport requires a 'server' field with a Server instance",
      );
    }

    const [clientTransport, serverTransport] = InMemoryTransport
      .createLinkedPair();
    // Connect the server to serverTransport asynchronously
    defAny.server.connect(serverTransport).catch((err: Error) => {
      console.error("Error connecting in-memory server:", err);
    });
    return clientTransport;
  }

  // Check for SSE transport (explicit or has url with sse type)
  if (explicitType === "sse") {
    const options: any = {};
    if (defAny.headers) {
      options.requestInit = { headers: defAny.headers };
      options.eventSourceInit = { headers: defAny.headers };
    }
    return new SSEClientTransport(new URL(defAny.url), options);
  }

  // Check for streamable HTTP transport (has url but not sse)
  // Cline/Claude Desktop format: { url: "...", headers: {...} }
  if (defAny.url && typeof defAny.url === "string") {
    const options: any = {};
    if (defAny.headers) {
      options.requestInit = { headers: defAny.headers };
    }
    return new StreamableHTTPClientTransport(new URL(defAny.url), options);
  }

  // Check for stdio transport (explicit type or has command)
  // Cline/Claude Desktop format: { command: "...", args: [...], env: {...} }
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

async function getOrCreateMcpClient(
  defKey: string,
  def: z.input<typeof ServerConfigSchema> | z.infer<typeof ServerConfigSchema>,
): Promise<Client> {
  const pooled = mcpClientPool.get(defKey);
  if (pooled) {
    pooled.refCount += 1;
    return pooled.client;
  }

  const existingConnecting = mcpClientConnecting.get(defKey);
  if (existingConnecting) {
    const client = await existingConnecting;
    const entry = mcpClientPool.get(defKey);
    if (entry) entry.refCount += 1;
    return client;
  }

  const transport = createTransport(def);

  const connecting = (async () => {
    const client = new Client({
      name: `mcp_${shortHash(defSignature(def))}`,
      version: "1.0.0",
    });
    await client.connect(transport, { timeout: 60_000 * 10 });
    return client;
  })();

  mcpClientConnecting.set(defKey, connecting);

  try {
    const client = await connecting;
    mcpClientPool.set(defKey, { client, refCount: 1 });
    return client;
  } finally {
    mcpClientConnecting.delete(defKey);
  }
}

async function releaseMcpClient(defKey: string) {
  const entry = mcpClientPool.get(defKey);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount <= 0) {
    mcpClientPool.delete(defKey);
    try {
      await entry.client.close();
    } catch (err) {
      console.error("Error closing MCP client:", err);
    }
  }
}

const cleanupAllPooledClients = async () => {
  const entries = Array.from(mcpClientPool.entries());
  mcpClientPool.clear();
  await Promise.all(
    entries.map(async ([, { client }]) => {
      try {
        await client.close();
      } catch (err) {
        console.error("Error closing MCP client:", err);
      }
    }),
  );
};

process.once?.("exit", () => {
  cleanupAllPooledClients();
});
process.once?.("SIGINT", () => {
  cleanupAllPooledClients().finally(() => process.exit(0));
});

export async function composeMcpDepTools(
  mcpConfig:
    | z.input<typeof McpSettingsSchema>
    | z.infer<typeof McpSettingsSchema>,
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
  const acquiredKeys: string[] = [];

  for (const [name, definition] of Object.entries(mcpConfig.mcpServers)) {
    const def = definition as unknown as z.infer<typeof ServerConfigSchema>;
    if (def.disabled) continue;

    const defKey = shortHash(defSignature(def));
    const serverId = name;

    try {
      const client = await getOrCreateMcpClient(defKey, def);
      acquiredKeys.push(defKey);
      allClients[serverId] = client;

      const { tools } = await client.listTools();

      tools.forEach((tool) => {
        const { toolNameWithScope, toolName: internalToolName } =
          smitheryToolNameCompatibale(tool.name, name);
        // Sanitize toolId to ensure it only contains valid characters
        const rawToolId = `${serverId}_${internalToolName}`;
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
          allClients[serverId].callTool(
            {
              name: internalToolName,
              arguments: args,
            },
            undefined,
            {
              timeout: def.toolCallTimeout,
            },
          );

        // Store the original toolNameWithScope for mapping purposes
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
    await Promise.all(acquiredKeys.map((k) => releaseMcpClient(k)));
    acquiredKeys.length = 0;
    Object.keys(allTools).forEach((key) => delete allTools[key]);
    Object.keys(allClients).forEach((key) => delete allClients[key]);
  };

  return { tools: allTools, clients: allClients, cleanupClients };
}
