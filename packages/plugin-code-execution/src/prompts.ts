/**
 * Code Execution Prompts
 *
 * Prompt templates for the code execution mode plugin.
 */

/**
 * Code Execution system prompt - progressive disclosure pattern
 */
export const CODE_EXECUTION_PROMPT =
  `Agentic tool \`{toolName}\` executes JavaScript code with MCP tool access.

<manual>
{description}
</manual>

<api>
\`callMCPTool(toolName, params)\` - Call any MCP tool
\`console.log(...)\` - Print output
</api>

<parameters>
\`code\` (optional) - JavaScript to execute
\`definitionsOf\` (optional) - Tool names whose schemas you need
\`hasDefinitions\` (optional) - Tool names whose schemas you already have
</parameters>

<rules>
- **First call**: No tool definitions available—you must request them via \`definitionsOf\`
- **When executing code**: Must provide \`hasDefinitions\` with ALL tools you have schemas for (avoid duplicate requests and reduce tokens)
- **When getting definitions**: Use \`definitionsOf\` to request tool schemas you need
- **Both together**: Execute code AND request new definitions in one call for efficiency
- **Never request definitions you already have**
</rules>

<examples>
Initial definition request:
\`\`\`json
{
  "hasDefinitions": [],
  "definitionsOf": ["tool1"]
}
\`\`\`
Execute code + get new definitions:
\`\`\`json
{
  "code": "await callMCPTool('tool1', {x: 1});",
  "hasDefinitions": ["tool1"],
  "definitionsOf": ["tool2"]
}
\`\`\`
</examples>`;

/**
 * Compile prompt with variables
 */
export function compilePrompt(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => variables[key] || "");
}
