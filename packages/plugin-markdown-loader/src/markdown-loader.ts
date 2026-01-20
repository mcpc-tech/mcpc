/**
 * Markdown Agent Definition Loader
 *
 * This module provides utilities to load agent definitions from Markdown files
 * with YAML front matter for configuration.
 *
 * Markdown agent files use the following format:
 * ```markdown
 * ---
 * name: my-agent
 * mode: agentic
 * maxSteps: 50
 * deps:
 *   mcpServers:
 *     desktop-commander:
 *       command: npx
 *       args: ["-y", "@wonderwhy-er/desktop-commander@latest"]
 *       transportType: stdio
 * ---
 *
 * # Agent Description
 *
 * Your agent description goes here in Markdown format.
 * You can use <tool name="server.tool_name"/> to reference tools.
 * ```
 *
 * @module
 */

import {
  type ComposeDefinition,
  isMarkdownFile,
  type McpServerConfig,
  type MCPSetting,
  type SamplingConfig,
} from "@mcpc/core";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "@std/yaml";
import process from "node:process";

// Re-export for convenience
export { isMarkdownFile, isMarkdownFile as isMarkdownAgentFile };

/**
 * Replace environment variable references in a string.
 * Supports $VAR_NAME syntax (case-insensitive).
 */
function replaceEnvVars(str: string): string {
  return str.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_match, varName) => {
    return process.env[varName] || "";
  });
}

/**
 * Recursively replace environment variables in an object.
 */
function replaceEnvVarsInObject<T>(obj: T): T {
  if (typeof obj === "string") {
    return replaceEnvVars(obj) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => replaceEnvVarsInObject(item)) as T;
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = replaceEnvVarsInObject(value);
    }
    return result as T;
  }
  return obj;
}

/**
 * Front matter configuration for Markdown agent definitions
 */
export interface MarkdownAgentFrontMatter {
  /** Agent name (required) */
  name: string;
  /** Execution mode */
  mode?: "agentic" | "ai_sampling" | "ai_acp" | "code_execution";
  /** Maximum execution steps */
  maxSteps?: number;
  /** Maximum tokens for sampling */
  maxTokens?: number;
  /** Enable tracing */
  tracingEnabled?: boolean;
  /** MCP server dependencies */
  deps?: {
    mcpServers: Record<string, McpServerConfig>;
  };
  /** Plugin file paths */
  plugins?: string[];
  /** Tool references */
  refs?: string[];
  /** Sampling configuration */
  samplingConfig?: SamplingConfig;
  /** Provider options for AI SDK sampling mode */
  providerOptions?: {
    modelPreferences?: {
      hints?: Array<{ name?: string }>;
      costPriority?: number;
      speedPriority?: number;
      intelligencePriority?: number;
    };
  };
  /** ACP settings for AI SDK ACP mode */
  acpSettings?: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    session?: {
      cwd?: string;
      mcpServers?: Array<{
        name: string;
        command: string;
        args?: string[];
        env?: Record<string, string>;
      }>;
    };
    persistSession?: boolean;
  };
}

/**
 * Result of parsing a Markdown agent file
 */
export interface ParsedMarkdownAgent {
  frontMatter: MarkdownAgentFrontMatter;
  description: string;
}

/**
 * Parse YAML front matter and Markdown content from a string
 */
export function parseMarkdownAgent(content: string): ParsedMarkdownAgent {
  const frontMatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = content.match(frontMatterRegex);

  if (!match) {
    throw new Error(
      "Invalid Markdown agent file: missing YAML front matter. " +
        "Expected format:\n---\nname: agent-name\n---\n\n# Description...",
    );
  }

  const [, yamlContent, markdownContent] = match;

  let frontMatter: MarkdownAgentFrontMatter;
  try {
    frontMatter = parseYaml(yamlContent) as MarkdownAgentFrontMatter;
  } catch (error) {
    throw new Error(`Failed to parse YAML front matter: ${error}`);
  }

  if (!frontMatter.name) {
    throw new Error(
      "Invalid Markdown agent file: 'name' is required in front matter",
    );
  }

  return {
    frontMatter,
    description: markdownContent.trim(),
  };
}

/**
 * Option keys that map directly from front matter to ComposeDefinition.options
 */
const OPTION_KEYS = [
  "mode",
  "maxSteps",
  "maxTokens",
  "tracingEnabled",
  "refs",
  "samplingConfig",
  "providerOptions",
  "acpSettings",
] as const;

/**
 * Convert parsed Markdown agent to ComposeDefinition
 */
export function markdownAgentToComposeDefinition(
  parsed: ParsedMarkdownAgent,
): ComposeDefinition {
  // Replace environment variables in front matter
  const frontMatter = replaceEnvVarsInObject(parsed.frontMatter);
  const description = replaceEnvVars(parsed.description);

  // Build options by picking defined keys from front matter
  const options: Record<string, unknown> = {};
  for (const key of OPTION_KEYS) {
    if (frontMatter[key] !== undefined) {
      options[key] = frontMatter[key];
    }
  }

  return {
    name: frontMatter.name,
    description,
    deps: frontMatter.deps as MCPSetting | undefined,
    plugins: frontMatter.plugins,
    ...(Object.keys(options).length > 0 ? { options } : {}),
  } as ComposeDefinition;
}

/**
 * Load a Markdown agent definition from a file path
 */
export async function loadMarkdownAgentFile(
  filePath: string,
): Promise<ComposeDefinition> {
  const content = await readFile(filePath, "utf-8");
  const parsed = parseMarkdownAgent(content);
  return markdownAgentToComposeDefinition(parsed);
}
