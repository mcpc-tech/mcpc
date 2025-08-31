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
  /** Plugin name for identification */
  name: string;

  /** Plugin execution order - 'pre' (before core), 'post' (after core), or default */
  enforce?: "pre" | "post";

  /** Apply plugin conditionally based on mode */
  apply?: "agentic" | "workflow" | ((mode: string) => boolean);

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
  server: any;
}

/** Context for transformTool hook */
export interface TransformContext {
  toolName: string;
  server: any;
  mode: "agentic" | "agentic_workflow";
}

/** Context for finalizeComposition hook */
export interface FinalizeContext {
  serverName: string;
  mode: "agentic" | "agentic_workflow";
  server: any;
}

/** Context for composeEnd hook */
export interface ComposeEndContext {
  toolName: string | null;
  pluginNames: string[];
  mode: "agentic" | "agentic_workflow";
  server: any;
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
  /** Tool visibility and access settings */
  visibility?: {
    /** Hide the tool from composed tools context */
    hide?: boolean;
    /** Register the tool as a global tool in the server's public tool list */
    global?: boolean;
    /** Internal tool - not visible in public list but accessible via callTool */
    internal?: boolean;
  };
}
