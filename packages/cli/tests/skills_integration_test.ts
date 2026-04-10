import { assertEquals, assertStringIncludes } from "@std/assert";
import { createServer } from "../src/app.ts";
import { join } from "node:path";

interface ToolResult {
  content?: { type: string; text: string }[];
  isError?: boolean;
}

async function writeSkill(
  rootDir: string,
  skillName: string,
  body: string,
  description = "Test skill description",
) {
  const skillDir = join(rootDir, skillName);
  await Deno.mkdir(skillDir, { recursive: true });
  await Deno.writeTextFile(
    join(skillDir, "SKILL.md"),
    `---\nname: ${skillName}\ndescription: ${description}\n---\n\n${body}\n`,
  );
}

Deno.test("CLI skills integration - createServer loads skills from default .agent/skills path", async () => {
  const originalCwd = Deno.cwd();
  const tempDir = await Deno.makeTempDir();

  try {
    const defaultSkillsDir = join(tempDir, ".agent", "skills");
    await writeSkill(
      defaultSkillsDir,
      "default-skill",
      "# Default Skill\n\nLoaded from the default skills path.",
      "Loads from default .agent/skills",
    );

    Deno.chdir(tempDir);

    const server = await createServer({
      name: "skills-default-server",
      version: "1.0.0",
      agents: [{
        name: "helper-agent",
        description: "Helper agent",
      }],
    });

    try {
      const result = (await server.callTool("helper-agent__load-skill", {
        skill: "default-skill",
      })) as ToolResult;

      const text = result.content?.find((c) => c.type === "text")?.text || "";
      assertEquals(result.isError, undefined);
      assertStringIncludes(text, "# Default Skill");
      assertStringIncludes(text, "Loaded from the default skills path.");
      assertStringIncludes(
        text,
        join(tempDir, ".agent", "skills", "default-skill"),
      );
    } finally {
      await server.close();
    }
  } finally {
    Deno.chdir(originalCwd);
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("CLI skills integration - createServer loads skills from config.skills paths", async () => {
  const tempDir = await Deno.makeTempDir();

  try {
    const customSkillsDir = join(tempDir, "custom-skills");
    await writeSkill(
      customSkillsDir,
      "custom-skill",
      "# Custom Skill\n\nLoaded from config.skills.",
      "Loads from config.skills",
    );

    const server = await createServer({
      name: "skills-custom-server",
      version: "1.0.0",
      skills: [customSkillsDir],
      agents: [{
        name: "custom-agent",
        description: "Custom agent",
      }],
    });

    try {
      const result = (await server.callTool("custom-agent__load-skill", {
        skill: "custom-skill",
      })) as ToolResult;

      const text = result.content?.find((c) => c.type === "text")?.text || "";
      assertEquals(result.isError, undefined);
      assertStringIncludes(text, "# Custom Skill");
      assertStringIncludes(text, "Loaded from config.skills.");
      assertStringIncludes(text, join(customSkillsDir, "custom-skill"));
    } finally {
      await server.close();
    }
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
