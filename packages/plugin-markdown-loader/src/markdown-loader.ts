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
import { readdir, readFile, stat } from "node:fs/promises";
import { parse as parseYaml } from "@std/yaml";
import { join } from "node:path";
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
  /**
   * Short description for progressive disclosure.
   * If provided, the Markdown body becomes the `manual` field.
   * If not provided, the Markdown body becomes the `description` field.
   */
  description?: string;
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
  /** The Markdown body content */
  body: string;
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
    body: markdownContent.trim(),
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
  const body = replaceEnvVars(parsed.body);

  // Build options by picking defined keys from front matter
  const options: Record<string, unknown> = {};
  for (const key of OPTION_KEYS) {
    if (frontMatter[key] !== undefined) {
      options[key] = frontMatter[key];
    }
  }

  // If frontMatter.description is provided, body becomes manual (progressive disclosure)
  // Otherwise, body becomes description (existing behavior)
  const hasDescription = frontMatter.description !== undefined;

  return {
    name: frontMatter.name,
    description: hasDescription ? frontMatter.description : body,
    ...(hasDescription && body ? { manual: body } : {}),
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

/**
 * Load all Markdown agent definitions from a directory.
 * Only loads .md files in the directory (non-recursive by default).
 *
 * @param dirPath - Path to the directory containing Markdown agent files
 * @param options - Options for loading
 * @param options.recursive - If true, recursively search subdirectories (default: false)
 * @returns Array of ComposeDefinition objects
 */
export async function loadMarkdownAgentDirectory(
  dirPath: string,
  options: { recursive?: boolean } = {},
): Promise<ComposeDefinition[]> {
  const { recursive = false } = options;
  const definitions: ComposeDefinition[] = [];

  async function processDirectory(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory() && recursive) {
        await processDirectory(fullPath);
      } else if (entry.isFile() && isMarkdownFile(entry.name)) {
        try {
          const definition = await loadMarkdownAgentFile(fullPath);
          definitions.push(definition);
        } catch (error) {
          // Skip files that fail to parse (e.g., non-agent markdown files)
          console.warn(`Skipping ${fullPath}: ${error}`);
        }
      }
    }
  }

  await processDirectory(dirPath);
  return definitions;
}

/**
 * Check if a path is a directory
 */
export async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}
