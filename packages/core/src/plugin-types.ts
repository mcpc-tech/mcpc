/**
 * Plugin system types for MCP server composition
 * Inspired by Vite's plugin system but adapted for MCP composition
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolCallback } from "./types.ts";
import type { ComposableMCPServer } from "./compose.ts";

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
  apply?: "agentic" | "workflow" | ((mode: string) => boolean);

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
  mode: "agentic" | "agentic_workflow";
  server: ComposableMCPServer;
  /** All available tool names before composition */
  availableTools: string[];
}

/** Context for transformTool hook */
export interface TransformContext {
  toolName: string;
  server: ComposableMCPServer;
  mode: "agentic" | "agentic_workflow";
  /** Original tool definition before any transformations */
  originalTool: ComposedTool;
  /** Index of current transformation (how many plugins have processed this tool) */
  transformationIndex: number;
}

/** Context for finalizeComposition hook */
export interface FinalizeContext {
  serverName: string;
  mode: "agentic" | "agentic_workflow";
  server: ComposableMCPServer;
  /** Names of all composed tools */
  toolNames: string[];
}

/** Context for composeEnd hook */
export interface ComposeEndContext {
  toolName: string | null;
  pluginNames: string[];
  mode: "agentic" | "agentic_workflow";
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
