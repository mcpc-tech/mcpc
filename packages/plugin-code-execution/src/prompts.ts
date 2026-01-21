/**
 * Code Execution Prompts
 * Uses Unix-style `man` command pattern from core for consistency.
 */

import { p } from "@mcpc/utils";

/**
 * Code Execution system prompt - Unix-style interface
 */
const PROMPT_TEMPLATE =
  `Agentic tool \`{toolName}\` executes JavaScript code with MCP tool access.

<manual>
{description}
</manual>

<api>
\`callMCPTool(toolName, params)\` - Call any MCP tool
\`console.log(...)\` - Print output
</api>

<available_tools>
{availableTools}
</available_tools>

<parameters>
\`tool\` - "man" to get tool schemas, "exec" to execute code
\`args\` - For "man": { tools: [...] }. For "exec": { code: "..." }
</parameters>

<rules>
1. **First call**: Use \`man\` to get tool schemas you need
2. **Execute code**: Use \`exec\` with JavaScript code that calls \`callMCPTool\`
</rules>

<format>
Get tool schemas:
\`\`\`json
{
  "tool": "man",
  "args": { "tools": ["tool1", "tool2"] }
}
\`\`\`

Execute code:
\`\`\`json
{
  "tool": "exec",
  "args": { "code": "const result = await callMCPTool('tool1', params); console.log(result);" }
}
\`\`\`
</format>`;

export const compilePrompt = p(PROMPT_TEMPLATE);
