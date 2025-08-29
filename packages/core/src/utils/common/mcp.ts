import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  McpSettingsSchema,
  ServerConfigSchema,
} from "../../service/tools.ts";
import type z from "zod";
import { smitheryToolNameCompatibale } from "./registory.ts";
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

function defSignature(def: z.infer<typeof ServerConfigSchema>) {
  // KISS: stringify full definition for a stable signature
  return JSON.stringify(def);
}

function buildServerIdFromDef(def: z.infer<typeof ServerConfigSchema>) {
  // Purely config-based ID; readable prefix + short hash
  return `srv_${shortHash(defSignature(def))}`;
}

async function getOrCreateMcpClient(
  defKey: string,
  def: z.infer<typeof ServerConfigSchema>,
): Promise<Client> {
  const pooled = mcpClientPool.get(defKey);
  if (pooled) {
    console.log(`Reusing MCP client for key: ${defKey}`);
    pooled.refCount += 1;
    return pooled.client;
  }

  console.log(`Creating new MCP client for key: ${defKey}`);
  const existingConnecting = mcpClientConnecting.get(defKey);
  if (existingConnecting) {
    const client = await existingConnecting;
    const entry = mcpClientPool.get(defKey);
    if (entry) entry.refCount += 1;
    return client;
  }

  let transport:
    | StdioClientTransport
    | StreamableHTTPClientTransport
    | SSEClientTransport;
  if (def.transportType === "sse") {
    transport = new SSEClientTransport(new URL(def.url));
  } else if ("url" in def) {
    // @ts-expect-error - Support new streamable http transport when url only
    transport = new StreamableHTTPClientTransport(new URL(def.url));
  } else if (def.transportType === "stdio" || "command" in def) {
    transport = new StdioClientTransport({
      command: def.command,
      args: def.args,
      env: {
        ...(process.env as any),
        ...def.env,
      },
      cwd: cwd(),
    });
  } else {
    throw new Error(`Unsupported transport type: ${JSON.stringify(def)}`);
  }

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
  mcpConfig: z.infer<typeof McpSettingsSchema>,
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
    const def = definition as z.infer<typeof ServerConfigSchema>;
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
        const toolId = `${serverId}_${internalToolName}`;
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
          allClients[serverId].callTool({
            name: internalToolName,
            arguments: args,
          });

        allTools[toolId] = { ...tool, execute };
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
