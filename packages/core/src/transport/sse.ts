/**
 * Server transport for SSE: this will send messages over an SSE connection and receive messages from HTTP POST requests.
 *
 * This implementation follows the Web Server-Sent Events API standard as implemented by Deno.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#fields
 * @see https://github.com/denoland/std/blob/9d765df2d9dd4653f68aecf4b0e387b9651cd16c/http/server_sent_event_stream.ts#L96
 */
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  type JSONRPCMessage,
  JSONRPCMessageSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ServerSentEventStream } from "@std/http/server-sent-event-stream";
import { AgentMCPServer } from "../../mod.ts";

/**
 * Session Manager: Map of session IDs to SSE server transports
 *
 * A singleton instance of the transport manager
 */
const transports = new Map<string, SSEServerTransport>();

export async function handleConnecting(
  request: Request,
  server: McpServer | AgentMCPServer,
  incomingMsgRoutePath: string
): Promise<Response> {
  // Check if a session ID is provided in the request
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");

  // Get the base URL to use as the endpoint for POST messages
  const endpoint = `${incomingMsgRoutePath}`;

  // If a session ID is provided, check if it exists
  if (sessionId) {
    if (transports.has(sessionId)) {
      // If the session exists, use the existing transport
      const transport = transports.get(sessionId)!;
      return transport.sseResponse;
    } else {
      // Return error if session ID is not found
      return new Response("Invalid or expired sessionId", { status: 404 });
    }
  }

  // Create a new transport with the endpoint if no session ID was provided
  const transport = new SSEServerTransport(endpoint);
  const newSessionId = transport.sessionId;
  transports.set(newSessionId, transport);
  server.connect(transport);
  console.log(`Created new SSE transport with sessionId: ${newSessionId}`);

  return transport.sseResponse;
}
/**
 * Handles POST messages for all SSE transports
 * @param request The HTTP request object
 * @param parsedBody Optional pre-parsed body to avoid consuming the request body stream
 * @returns A Response object indicating success or failure
 */
export async function handleIncoming(request: Request): Promise<Response> {
  // Validate session ID if provided in query params
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    return new Response("Missing sessionId parameter", { status: 400 });
  }

  const transport = transports.get(sessionId);
  if (!transport) {
    return new Response("Invalid or expired sessionId", { status: 404 });
  }

  if (!transport.isConnected) {
    return new Response("SSE connection not established", { status: 500 });
  }

  // Validate content type
  const contentTypeHeader = request.headers.get("content-type");
  if (!contentTypeHeader?.includes("application/json")) {
    return new Response("Unsupported content-type: Expected application/json", {
      status: 415,
    });
  }

  try {
    // Now delegate to the transport's handlePostMessage with the optional parsed body
    return await transport.handlePostMessage(request);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(errorMessage, { status: 400 });
  }
}

/**
 * Server transport for SSE: this will send messages over an SSE connection and receive messages from HTTP POST requests.
 *
 * This implementation uses web standard APIs and is compatible with Deno.
 */
export class SSEServerTransport implements Transport {
  #sseResponse?: Response;
  #sessionId: string;
  #controller?: ReadableStreamDefaultController;
  #stream: ReadableStream;
  #endpoint: string;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  /**
   * Creates a new SSE server transport, which will direct the client to POST messages to the relative or absolute URL identified by `endpoint`.
   */
  constructor(endpoint: string) {
    this.#endpoint = endpoint;
    this.#sessionId = crypto.randomUUID();
    this.#stream = new ReadableStream({
      start: (controller) => {
        this.#controller = controller;
      },
      cancel: () => {
        console.log("SSE stream cancelled with sessionId: ", this.#sessionId);
        this.#controller = undefined;
        this.close();
      },
    }).pipeThrough(
      // Support standard sse stream chunk syntax
      new ServerSentEventStream()
    );
  }

  /**
   * Handles the initial SSE connection request.
   *
   * This should be called when a GET request is made to establish the SSE stream.
   */
  async start() {
    if (this.#sseResponse) {
      throw new Error(
        "SSEServerTransport already started! If using Server class, note that connect() calls start() automatically."
      );
    }

    this.#controller?.enqueue({
      event: "endpoint",
      data: `${this.#endpoint}?sessionId=${this.#sessionId}`,
      id: Date.now().toString(),
    });

    this.#sseResponse = new Response(this.#stream, {
      status: 200,
      statusText: "OK",
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });

    await Promise.resolve();
  }

  /**
   * Handles incoming POST messages.
   *
   * This should be called when a POST request is made to send a message to the server.
   */
  async handlePostMessage(request: Request): Promise<Response> {
    if (!this.#sseResponse) {
      const message = "SSE connection not established";
      return new Response(message, { status: 500 });
    }

    try {
      const contentType = request.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(`Unsupported content-type: ${contentType}`);
      }

      const body = await request.json();
      await this.handleMessage(body);

      return new Response("Accepted", { status: 202 });
    } catch (error) {
      console.log(error);
      this.onerror?.(error instanceof Error ? error : new Error(String(error)));
      return new Response(String(error), { status: 400 });
    }
  }

  /**
   * Handle a client message, regardless of how it arrived. This can be used to inform the server of messages that arrive via a means different than HTTP POST.
   */
  async handleMessage(message: unknown): Promise<void> {
    let parsedMessage: JSONRPCMessage;
    try {
      parsedMessage = JSONRPCMessageSchema.parse(message);
    } catch (error) {
      this.onerror?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }

    this.onmessage?.(parsedMessage);
    await Promise.resolve();
  }

  async close(): Promise<void> {
    transports.delete(this.#sessionId);
    this.#controller?.close();
    this.#controller = undefined;
    this.onclose?.();
    await Promise.resolve();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.#controller) {
      throw new Error("Not connected");
    }

    this.#controller.enqueue({
      data: JSON.stringify(message),
      event: "message",
      id: Date.now().toString(),
    });
    await Promise.resolve();
  }

  /**
   * Returns the session ID for this transport.
   *
   * This can be used to route incoming POST requests.
   */
  get sessionId(): string {
    return this.#sessionId;
  }

  get sseStream(): ReadableStream {
    return this.#stream;
  }

  get sseResponse(): Response {
    return this.#sseResponse!;
  }

  get isConnected(): boolean {
    return this.#controller !== undefined;
  }
}
