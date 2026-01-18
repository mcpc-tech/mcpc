/**
 * Skills Plugin - Adds domain-specific knowledge with lazy loading
 * Follows Agent Skills specification: https://agentskills.io/specification
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { ComposeStartContext, ToolPlugin } from "../plugin-types.ts";
import type { ComposableMCPServer } from "../compose.ts";
import { jsonSchema } from "../utils/schema.ts";

/** Standard SKILL.md frontmatter fields per agentskills.io spec */
interface SkillFrontmatter {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  "allowed-tools"?: string;
}

interface SkillMeta extends SkillFrontmatter {
  /** Skill directory path */
  basePath: string;
  /** SKILL.md file path */
  filePath: string;
}

interface SkillsPluginOptions {
  /** Directories to scan for skills */
  paths: string[];
}

/**
 * Parse YAML frontmatter from SKILL.md content
 */
function parseFrontmatter(content: string): SkillFrontmatter | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const result: Record<string, unknown> = {};

  for (const line of yaml.split("\n")) {
    // Handle metadata block
    if (line.trim() === "metadata:") {
      result.metadata = {};
      continue;
    }

    // Handle indented metadata entries
    const metadataMatch = line.match(/^\s{2}(\w+):\s*"?([^"]*)"?$/);
    if (metadataMatch && result.metadata) {
      (result.metadata as Record<string, string>)[metadataMatch[1]] =
        metadataMatch[2];
      continue;
    }

    // Handle top-level fields
    const fieldMatch = line.match(/^(\S+):\s*(.*)$/);
    if (fieldMatch) {
      const [, key, value] = fieldMatch;
      result[key] = value.replace(/^["']|["']$/g, "");
    }
  }

  if (!result.name || !result.description) return null;
  return result as unknown as SkillFrontmatter;
}

/**
 * Extract body content (without frontmatter) from SKILL.md
 */
function extractBody(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n*/, "");
}

/**
 * Scan directory for skills (directories containing SKILL.md)
 */
async function scanSkills(basePath: string): Promise<SkillMeta[]> {
  const skills: SkillMeta[] = [];

  try {
    const entries = await readdir(basePath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = join(basePath, entry.name);
      const skillFile = join(skillDir, "SKILL.md");

      try {
        await stat(skillFile);
        const content = await readFile(skillFile, "utf-8");
        const frontmatter = parseFrontmatter(content);

        if (frontmatter && frontmatter.name === entry.name) {
          skills.push({
            ...frontmatter,
            basePath: skillDir,
            filePath: skillFile,
          });
        }
      } catch {
        // SKILL.md not found, skip
      }
    }
  } catch {
    // Directory not found, skip
  }

  return skills;
}

/**
 * Generate tool description with available skills list
 */
function generateToolDescription(
  skills: SkillMeta[],
  agentName: string,
): string {
  if (skills.length === 0) {
    return "Load a skill's instructions. No skills available.";
  }

  const skillsList = skills
    .map((s) => `- ${s.name}: ${s.description}`)
    .join("\n");

  const toolName = `${agentName}__load-skill`;

  return `Load a skill's detailed instructions or bundled files for the "${agentName}" agent.

Available skills:
${skillsList}

Usage:
- ${toolName}({ skill: "skill-name" }) - Load main SKILL.md content
- ${toolName}({ skill: "skill-name", ref: "references/file.md" }) - Load reference documentation
- ${toolName}({ skill: "skill-name", ref: "scripts/run.sh" }) - Load script content
- ${toolName}({ skill: "skill-name", ref: "assets/config.json" }) - Load asset file

Note: Binary files are returned as base64 (up to 1MB).`;
}

/**
 * Create a skills plugin that adds domain knowledge with lazy loading
 */
export function createSkillsPlugin(options: SkillsPluginOptions): ToolPlugin {
  const { paths } = options;

  // Store scanned skills metadata
  const skillsMap = new Map<string, SkillMeta>();

  // Store server reference for tool registration
  let serverRef: ComposableMCPServer | null = null;

  return {
    name: "plugin-skills",
    version: "1.0.0",

    // Save server reference
    configureServer: (server) => {
      serverRef = server;
    },

    // Scan directories and register tool
    composeStart: async (context: ComposeStartContext) => {
      skillsMap.clear();

      for (const dir of paths) {
        const skills = await scanSkills(dir);
        for (const skill of skills) {
          skillsMap.set(skill.name, skill);
        }
      }

      // Generate tool description with skills list
      const agentName = context.serverName;
      const toolDescription = generateToolDescription(
        Array.from(skillsMap.values()),
        agentName,
      );
      const toolName = `${agentName}__load-skill`;

      // Register load-skill tool with agent name prefix
      if (serverRef) {
        serverRef.tool(
          toolName,
          toolDescription,
          jsonSchema<{ skill: string; ref?: string }>({
            type: "object",
            properties: {
              skill: {
                type: "string",
                description: "The skill name to load",
              },
              ref: {
                type: "string",
                description:
                  "Optional: relative path to a file within the skill directory (references/, scripts/, or assets/)",
              },
            },
            required: ["skill"],
          }),
          async (args: { skill: string; ref?: string }) => {
            const meta = skillsMap.get(args.skill);
            if (!meta) {
              return {
                content: [
                  { type: "text", text: `Skill "${args.skill}" not found` },
                ],
                isError: true,
              };
            }

            // Load reference file
            if (args.ref) {
              const refPath = resolve(meta.basePath, args.ref);
              const relPath = relative(meta.basePath, refPath);

              // Security: prevent path traversal
              if (relPath.startsWith("..")) {
                return {
                  content: [
                    { type: "text", text: `Invalid ref path: ${args.ref}` },
                  ],
                  isError: true,
                };
              }

              // Check if file exists
              try {
                await stat(refPath);
              } catch {
                return {
                  content: [
                    { type: "text", text: `File not found: ${args.ref}` },
                  ],
                  isError: true,
                };
              }

              // Read file content
              try {
                const buffer = await readFile(refPath);
                // Try to decode as UTF-8 text
                const decoder = new TextDecoder("utf-8", { fatal: true });
                try {
                  const text = decoder.decode(buffer);
                  // scripts/ - include execution hint
                  if (
                    relPath.startsWith("scripts/") ||
                    relPath.startsWith("scripts\\")
                  ) {
                    return {
                      content: [
                        {
                          type: "text",
                          text: `# Script: ${args.ref}\n\n\`\`\`\n${text}\`\`\`\n\nTo execute this script, use an appropriate execution tool.`,
                        },
                      ],
                    };
                  }
                  return { content: [{ type: "text", text }] };
                } catch {
                  // Binary file - return base64 for small files, hint for large
                  const size = buffer.byteLength;
                  if (size > 1024 * 1024) {
                    // > 1MB
                    return {
                      content: [
                        {
                          type: "text",
                          text: `Binary file: ${args.ref} (${(size / 1024 / 1024).toFixed(2)} MB)\n\nFile too large to return inline.`,
                        },
                      ],
                    };
                  }
                  // Return base64 for smaller binary files
                  const base64 = btoa(
                    String.fromCharCode(...new Uint8Array(buffer)),
                  );
                  return {
                    content: [
                      {
                        type: "text",
                        text: `Binary file: ${args.ref} (${size} bytes)\n\nBase64 content:\n${base64}`,
                      },
                    ],
                  };
                }
              } catch {
                return {
                  content: [
                    { type: "text", text: `Failed to read file: ${args.ref}` },
                  ],
                  isError: true,
                };
              }
            }

            // Load SKILL.md body
            try {
              const content = await readFile(meta.filePath, "utf-8");
              const body = extractBody(content);
              return { content: [{ type: "text", text: body }] };
            } catch {
              return {
                content: [
                  { type: "text", text: `Failed to load skill: ${args.skill}` },
                ],
                isError: true,
              };
            }
          },
          { internal: false },
        );
      }
    },

    dispose: () => {
      skillsMap.clear();
      serverRef = null;
    },
  };
}

/**
 * Factory function for parameterized usage via string path
 *
 * Supports query parameters:
 * - paths: Comma-separated list of skill directories
 *
 * @example
 * ```ts
 * // Via string path with query params
 * plugins: [
 *   "@mcpc/core/plugins/skills?paths=./skills,./more-skills"
 * ]
 * ```
 */
export function createPlugin(params: Record<string, string>): ToolPlugin {
  const paths = params.paths?.split(",").map((p) => p.trim()).filter(Boolean) ||
    [];
  return createSkillsPlugin({ paths });
}

export default createSkillsPlugin;
