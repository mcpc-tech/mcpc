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
   * Session configuration (ACP protocol) - Required
   */
  session: ACPSessionConfig;

  /**
   * Initialize configuration (ACP protocol) - Optional
   */
  initialize?: ACPInitializeConfig;
}
