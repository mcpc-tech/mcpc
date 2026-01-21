/**
 * Plugin system types for MCP server composition
 * Inspired by Vite's plugin system but adapted for MCP composition
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolCallback } from "./types.ts";
import type { ComposableMCPServer } from "./compose.ts";
import type { ExecutionMode } from "./prompts/types.ts";

export interface ComposedTool extends Tool {
  execute: ToolCallback;
}

// === Plugin Lifecycle Hooks ===

export interface ToolPlugin {
  /** Plugin name for identification (must be unique) */
  name: string;

  /** Plugin version for debugging and compatibility checks */
  version?: string;

  /** Plugin execution order - 'pre' (before core), 'post' (after core), or default */
  enforce?: "pre" | "post";

  /** Apply plugin conditionally based on mode */
  apply?: ExecutionMode | ((mode: string) => boolean);

  /** Plugin dependencies - names of plugins that must be loaded first */
  dependencies?: string[];

  // === MCP Composition Lifecycle Hooks ===

  /** Called when plugin is added to server - for initial setup */
  configureServer?: (server: ComposableMCPServer) => void | Promise<void>;

  /** Called before composition starts - for validation and config */
  composeStart?: (context: ComposeStartContext) => void | Promise<void>;

  /** Called for each tool during composition - main transformation hook */
  transformTool?: (
    tool: ComposedTool,
    context: TransformContext,
  ) => ComposedTool | void | Promise<ComposedTool | void>;

  /** Called after all tools are composed but before registration */
  finalizeComposition?: (
    tools: Record<string, ComposedTool>,
    context: FinalizeContext,
  ) => void | Promise<void>;

  /**
   * Called to register the final agent tool (execution mode).
   * If multiple plugins implement this, the last one wins.
   * Use this to implement custom execution modes.
   */
  registerAgentTool?: (
    context: AgentToolRegistrationContext,
  ) => void | Promise<void>;

  /** Called after composition is complete - for logging and cleanup */
  composeEnd?: (result: ComposeEndContext) => void | Promise<void>;

  // === Runtime Transformation Hooks ===

  /** Called before tool execution - transform input arguments */
  transformInput?: (
    args: unknown,
    context: RuntimeTransformContext,
  ) => unknown | Promise<unknown>;

  /** Called after tool execution - transform output result */
  transformOutput?: (
    result: unknown,
    context: RuntimeTransformContext,
  ) => unknown | Promise<unknown>;

  // === Tool Execution Lifecycle Hooks ===

  /**
   * Called before a tool is executed
   * Use this to intercept tool calls, modify arguments, or skip execution entirely.
   * This enables dynamic tool context handoff to AI agents.
   *
   * @returns BeforeToolExecuteResult to modify behavior, or void/undefined to continue normally
   */
  beforeToolExecute?: (
    context: BeforeToolExecuteContext,
  ) => BeforeToolExecuteResult | void | Promise<BeforeToolExecuteResult | void>;

  /**
   * Called after a tool is executed (or skipped)
   * Use this to modify results, log execution, or trigger follow-up actions.
   *
   * @returns AfterToolExecuteResult to modify the result, or void/undefined to keep original
   */
  afterToolExecute?: (
    context: AfterToolExecuteContext,
  ) => AfterToolExecuteResult | void | Promise<AfterToolExecuteResult | void>;

  /** Called when plugin is removed or server is disposed - for cleanup */
  dispose?: () => void | Promise<void>;
}

// === Context Types ===

export interface CompositionInfo {
  serverName: string;
  externalToolNames: string[];
  internalToolNames: string[];
  pluginNames: string[];
  totalTools: number;
}

/** Context for composeStart hook */
export interface ComposeStartContext {
  serverName: string;
  description: string;
  mode: ExecutionMode;
  server: ComposableMCPServer;
  /** All available tool names before composition */
  availableTools: string[];
}

/** Context for transformTool hook */
export interface TransformContext {
  toolName: string;
  server: ComposableMCPServer;
  mode: ExecutionMode;
  /** Original tool definition before any transformations */
  originalTool: ComposedTool;
  /** Index of current transformation (how many plugins have processed this tool) */
  transformationIndex: number;
}

/** Context for finalizeComposition hook */
export interface FinalizeContext {
  serverName: string;
  mode: ExecutionMode;
  server: ComposableMCPServer;
  /** Names of all composed tools */
  toolNames: string[];
}

/** Context for registerAgentTool hook - implements custom execution modes */
export interface AgentToolRegistrationContext {
  server: ComposableMCPServer;
  name: string;
  description: string;
  /** Optional manual for progressive disclosure */
  manual?: string;
  mode: ExecutionMode | string;
  allToolNames: string[];
  toolNameToDetailList: [string, ComposedTool][];
  depGroups: Record<string, unknown>;
  toolNameToIdMapping?: Map<string, string>;
  publicToolNames: string[];
  hiddenToolNames: string[];
  options: {
    mode?: string;
    samplingConfig?: { maxIterations?: number; summarize?: boolean };
    steps?: Array<{ description: string; actions: string[] }>;
    ensureStepActions?: string[];
    [key: string]: unknown;
  };
}

/** Context for composeEnd hook */
export interface ComposeEndContext {
  toolName: string | null;
  pluginNames: string[];
  mode: ExecutionMode;
  server: ComposableMCPServer;
  /** Composition statistics - simplified */
  stats: {
    totalTools: number;
    /** Tools exposed to MCP clients (public: true) */
    publicTools: number;
    /** Tools hidden from agent context (hidden: true) */
    hiddenTools: number;
  };
}

/** Context for runtime transformation hooks (transformInput/transformOutput) */
export interface RuntimeTransformContext {
  toolName: string;
  server: ComposableMCPServer;
  /** Original input arguments (available in transformOutput) */
  originalArgs?: unknown;
  /** Transformation direction */
  direction: "input" | "output";
}

// === Tool Execution Lifecycle Hooks Context ===

/**
 * Result of beforeToolExecute hook
 * Allows plugins to modify execution or skip it entirely
 */
export interface BeforeToolExecuteResult {
  /**
   * If true, skip the actual tool execution and use the provided result
   * This enables dynamic handoff to AI agents
   */
  skipExecution?: boolean;
  /**
   * Modified arguments to pass to the tool (if not skipping)
   */
  modifiedArgs?: unknown;
  /**
   * Result to return if skipping execution
   * Required when skipExecution is true
   */
  result?: unknown;
  /**
   * Optional metadata to pass to afterToolExecute
   */
  metadata?: Record<string, unknown>;
}

/** Context for beforeToolExecute hook */
export interface BeforeToolExecuteContext {
  /** Name of the tool being executed */
  toolName: string;
  /** Arguments passed to the tool */
  args: unknown;
  /** The MCP server instance */
  server: ComposableMCPServer;
  /** Tool definition (if available) */
  toolDefinition?: ComposedTool;
  /** Whether this is an internal tool call (within agent) vs external (from MCP client) */
  isInternalCall: boolean;
  /** Parent agent name (if called from within an agent) */
  agentName?: string;
  /** Execution context chain (for nested agent calls) */
  executionChain?: string[];
}

/** Context for afterToolExecute hook */
export interface AfterToolExecuteContext {
  /** Name of the tool that was executed */
  toolName: string;
  /** Original arguments passed to the tool */
  args: unknown;
  /** Result from tool execution */
  result: unknown;
  /** The MCP server instance */
  server: ComposableMCPServer;
  /** Whether execution was skipped by beforeToolExecute */
  wasSkipped: boolean;
  /** Time taken for execution in milliseconds */
  executionTimeMs: number;
  /** Whether the result indicates an error */
  isError: boolean;
  /** Metadata from beforeToolExecute */
  metadata?: Record<string, unknown>;
  /** Whether this is an internal tool call */
  isInternalCall: boolean;
  /** Parent agent name (if called from within an agent) */
  agentName?: string;
}

/**
 * Result of afterToolExecute hook
 * Allows plugins to modify the final result
 */
export interface AfterToolExecuteResult {
  /**
   * Modified result to return
   */
  modifiedResult?: unknown;
  /**
   * If true, mark the result as an error
   */
  markAsError?: boolean;
}

// === Plugin Options ===

export type PluginOption =
  | ToolPlugin
  | ToolPlugin[]
  | (() => ToolPlugin | ToolPlugin[] | null | undefined)
  | null
  | undefined
  | false;

// === Tool Configuration ===

export interface ToolConfig {
  /** Override the tool's description */
  description?: string;
  /** Tool visibility settings - simplified to two independent flags */
  visibility?: {
    /**
     * If true, tool is exposed to MCP clients (appears in listTools response)
     * Mapped from XML: <tool name="xxx" global/>
     * Default: false (tool only available within agent)
     */
    public?: boolean;
    /**
     * If true, tool is hidden from agent's tool context (but still callable)
     * Mapped from XML: <tool name="xxx" hide/>
     * Default: false (tool appears in agent description)
     */
    hidden?: boolean;
  };
}
