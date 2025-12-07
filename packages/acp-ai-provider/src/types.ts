import type {
  InitializeRequest,
  NewSessionRequest,
} from "@agentclientprotocol/sdk";

/**
 * Session configuration - uses ACP SDK's NewSessionRequest
 */
export type ACPSessionConfig = NewSessionRequest;

/**
 * Initialize configuration - uses ACP SDK's InitializeRequest
 */
export type ACPInitializeConfig = InitializeRequest;

/**
 * Provider settings - combines process configuration with protocol configuration
 */
export interface ACPProviderSettings {
  /**
   * Command to execute the ACP agent
   */
  command: string;

  /**
   * Arguments to pass to the command
   */
  args?: string[];

  /**
   * Environment variables for the agent process
   */
  env?: Record<string, string>;

  /**
   * Session configuration (ACP protocol) - Required when creating a new session
   * Can be partial when using existingSessionId (only cwd and mcpServers are used)
   */
  session: ACPSessionConfig;

  /**
   * Initialize configuration (ACP protocol) - Optional
   */
  initialize?: ACPInitializeConfig;

  /**
   * Authentication method ID to use (if required by the ACP agent)
   *
   * Set to undefined to use the first available method, and you can see a warning of all available methods.
   */
  authMethodId?: string;

  /**
   * Load an existing session instead of creating a new one.
   */
  existingSessionId?: string;

  /**
   * Keep connection alive after each call for session reuse.
   */
  persistSession?: boolean;

  /**
   * AI SDK-style tools to expose to the ACP agent.
   * These tools will be executed on the host side via a dynamic MCP proxy.
   */
  tools?: Record<
    string,
    {
      description?: string;
      parameters?: {
        type: "object";
        properties?: Record<string, unknown>;
        required?: string[];
        [key: string]: unknown;
      };
      execute?: (args: unknown) => Promise<unknown>;
    }
  >;
}
