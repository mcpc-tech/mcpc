/**
 * Skills Plugin - Adds domain-specific knowledge with lazy loading
 * Follows Agent Skills specification: https://agentskills.io/specification
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { ComposeStartContext, ToolPlugin } from "../plugin-types.ts";
import type { ComposableMCPServer } from "../compose.ts";
import { jsonSchema } from "../utils/schema.ts";

/** Skill metadata from SKILL.md frontmatter */
interface SkillMeta {
  name: string;
  description: string;
  basePath: string;
}

interface SkillsPluginOptions {
  /** Directories to scan for skills */
  paths: string[];
}

/**
 * Parse YAML frontmatter from SKILL.md content
 */
function parseFrontmatter(
  content: string,
): { name: string; description: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  let name = "", description = "";

  for (const line of yaml.split("\n")) {
    const m = line.match(/^(name|description):\s*(.+)$/);
    if (m) {
      // Remove surrounding quotes if present
      const value = m[2].replace(/^["']|["']$/g, "");
      if (m[1] === "name") name = value;
      else description = value;
    }
  }

  return name && description ? { name, description } : null;
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
        const content = await readFile(skillFile, "utf-8");
        const frontmatter = parseFrontmatter(content);

        if (frontmatter && frontmatter.name === entry.name) {
          skills.push({
            ...frontmatter,
            basePath: skillDir,
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

  return `Load a skill's instructions or reference files for the "${agentName}" agent.

Available skills:
${skillsList}

Usage:
- ${toolName}({ skill: "skill-name" }) - Load main SKILL.md content
- ${toolName}({ skill: "skill-name", ref: "path/to/file" }) - Load reference file

Note: For scripts/, use the bash tool with the script path to execute.`;
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
                  "Optional: relative path to any file within the skill directory",
              },
            },
            required: ["skill"],
          }),
          async (args: { skill: string; ref?: string }) => {
            const meta = skillsMap.get(args.skill);
            if (!meta) {
              const available = Array.from(skillsMap.keys());
              const availableList = available.length > 0
                ? `\n\nAvailable skills: ${available.join(", ")}`
                : "\n\nNo skills available.";
              return {
                content: [
                  {
                    type: "text",
                    text: `Skill "${args.skill}" not found.${availableList}`,
                  },
                ],
                isError: true,
              };
            }

            // Load file by ref path
            if (args.ref) {
              const refPath = resolve(meta.basePath, args.ref);
              const relPath = relative(meta.basePath, refPath);

              // Security: prevent path traversal
              if (relPath.startsWith("..")) {
                return {
                  content: [{
                    type: "text",
                    text: `Invalid path: ${args.ref}`,
                  }],
                  isError: true,
                };
              }

              // scripts/ and assets/ return path only to avoid polluting context
              const dir = relPath.split(/[/\\]/)[0];
              if (dir === "scripts" || dir === "assets") {
                return {
                  content: [{ type: "text", text: `Path: ${refPath}` }],
                };
              }

              try {
                const content = await readFile(refPath, "utf-8");
                return { content: [{ type: "text", text: content }] };
              } catch {
                return {
                  content: [{
                    type: "text",
                    text: `File not found: ${args.ref}`,
                  }],
                  isError: true,
                };
              }
            }

            // Load SKILL.md body
            try {
              const content = await readFile(
                join(meta.basePath, "SKILL.md"),
                "utf-8",
              );
              const body = extractBody(content);
              // Include skill absolute path for reference
              const skillPathInfo = `\n---\nSkill path: ${meta.basePath}\n`;
              return {
                content: [{ type: "text", text: body + skillPathInfo }],
              };
            } catch {
              return {
                content: [
                  { type: "text", text: `Failed to load skill: ${args.skill}` },
                ],
                isError: true,
              };
            }
          },
          { internal: true },
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
