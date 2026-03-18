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
   * Authentication method ID used by lazy auth.
   *
   * The provider does NOT authenticate during initialize.
   * If a request fails with an auth-required error,
   * it will call `authenticate(authMethodId)` and retry once automatically.
   *
   * If undefined, lazy auth defaults to the first method from `initialize.authMethods` (when available).
   * You can still call `provider.authenticate()` manually.
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
   * Delay in milliseconds to wait before initializing the connection.
   * Useful for agents that load MCP servers asynchronously.
   */
  sessionDelayMs?: number;
}
