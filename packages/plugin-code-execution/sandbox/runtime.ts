/**
 * Deno Sandbox Runtime
 *
 * This script runs inside the Deno sandbox and executes user code.
 * It communicates with the host process via JSON-RPC over stdin/stdout.
 */

import {
  JsonRpcMethod,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "../src/types.ts";

// Accumulated logs from console
const logs: string[] = [];

/**
 * Send JSON-RPC request to host and wait for response
 */
async function sendRequest(method: string, params?: unknown): Promise<unknown> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const requestId = crypto.randomUUID();

  // Send request
  const request = JSON.stringify({
    jsonrpc: "2.0",
    id: requestId,
    method,
    params,
  }) + "\n";
  await Deno.stdout.write(encoder.encode(request));

  // Read response line by line
  const buffer = new Uint8Array(65536);
  while (true) {
    const n = await Deno.stdin.read(buffer);
    if (n === null) throw new Error("Stdin closed");

    const data = decoder.decode(buffer.subarray(0, n));
    const lines = data.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      try {
        const response: JsonRpcResponse = JSON.parse(line);
        if (response.id !== requestId) continue;

        if (response.error) {
          throw new Error(`JSON-RPC Error: ${response.error.message}`);
        }
        return response.result;
      } catch (e) {
        if (!(e instanceof SyntaxError)) throw e;
        // Incomplete JSON, keep reading
      }
    }
  }
}

/**
 * Call MCP tool from user code
 */
const callMCPTool = async (
  toolName: string,
  params: unknown,
): Promise<unknown> => {
  return await sendRequest(JsonRpcMethod.CALL_TOOL, { toolName, params });
};

/**
 * Format value for logging
 */
function formatValue(value: unknown): string {
  return typeof value === "object" && value !== null
    ? JSON.stringify(value, null, 2)
    : String(value);
}

/**
 * Execute user code in sandbox
 */
async function executeCode(
  code: string,
): Promise<{ logs: string[]; result?: unknown; error?: string }> {
  logs.length = 0; // Clear logs

  // Console that captures output
  const console = {
    log: (...args: unknown[]) => logs.push(args.map(formatValue).join(" ")),
    error: (...args: unknown[]) =>
      logs.push("ERROR: " + args.map(formatValue).join(" ")),
    warn: (...args: unknown[]) =>
      logs.push("WARN: " + args.map(formatValue).join(" ")),
    info: (...args: unknown[]) =>
      logs.push("INFO: " + args.map(formatValue).join(" ")),
  };

  try {
    const fn = new Function(
      "console",
      "callMCPTool",
      `return (async () => { ${code} })();`,
    );
    const result = await fn(console, callMCPTool);
    return { logs: [...logs], result };
  } catch (error) {
    return {
      logs: [...logs],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Main message loop - processes JSON-RPC requests from host
 */
async function main() {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const buffer = new Uint8Array(65536);

  while (true) {
    const n = await Deno.stdin.read(buffer);
    if (n === null) break; // Stdin closed

    const data = decoder.decode(buffer.subarray(0, n));
    const lines = data.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      try {
        const request: JsonRpcRequest = JSON.parse(line);
        let result;

        if (request.method === JsonRpcMethod.EXECUTE_CODE) {
          const params = request.params as {
            code: string;
            hasDefinitions: string[];
          };
          result = await executeCode(params.code);
        } else if (request.method === JsonRpcMethod.GET_TOOL_DEFINITIONS) {
          const params = request.params as { toolNames: string[] };
          result = { received: params.toolNames };
        } else {
          continue; // Unknown method, skip
        }

        const response = JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          result,
        }) + "\n";

        await Deno.stdout.write(encoder.encode(response));
      } catch (error) {
        if (!(error instanceof SyntaxError)) {
          console.error("Error processing request:", error);
        }
      }
    }
  }
}

// Start the main loop
main().catch((error) => {
  console.error("Fatal error in sandbox:", error);
  Deno.exit(1);
});
