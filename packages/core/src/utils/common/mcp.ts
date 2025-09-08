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

function defSignature(
  def: z.input<typeof ServerConfigSchema> | z.infer<typeof ServerConfigSchema>,
) {
  // KISS: stringify full definition for a stable signature
  return JSON.stringify(def);
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

  let transport:
    | StdioClientTransport
    | StreamableHTTPClientTransport
    | SSEClientTransport;
  // Runtime type guards for union shape
  if (
    typeof (def as any).transportType === "string" &&
    (def as any).transportType === "sse"
  ) {
    const options: any = {};
    if ((def as any).headers) {
      options.requestInit = { headers: (def as any).headers };
      options.eventSourceInit = { headers: (def as any).headers };
    }
    transport = new SSEClientTransport(new URL((def as any).url), options);
  } else if ("url" in (def as any) && typeof (def as any).url === "string") {
    const options: any = {};
    if ((def as any).headers) {
      options.requestInit = { headers: (def as any).headers };
    }
    transport = new StreamableHTTPClientTransport(
      new URL((def as any).url),
      options,
    );
  } else if (
    (typeof (def as any).transportType === "string" &&
      (def as any).transportType === "stdio") ||
    ("command" in (def as any))
  ) {
    transport = new StdioClientTransport({
      command: (def as any).command,
      args: (def as any).args,
      env: {
        ...(process.env as any),
        ...((def as any).env ?? {}),
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
