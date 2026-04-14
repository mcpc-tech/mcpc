/**
 * Code Execution + Sampling prompts
 */

import { p } from "@mcpc/utils";

const PROMPT_TEMPLATE =
  `Agentic tool \`{toolName}\` executes JavaScript code with MCP tool access and MCP sampling-backed model calls.

<manual>
{description}
</manual>

<api>
**\`tool(toolName, params)\`** — Call any MCP tool. Returns \`{ content: [{ type: "text", text: "..." }] }\`.

\`\`\`js
const result = await tool("add", { a: 1, b: 2 });
const value = result.content[0].text;  // "3"
\`\`\`

**\`sampling(prompt, outputSchema)\`** — Ask the connected model to reason and return structured output.
- \`prompt\`: string — the question or task
- \`outputSchema\`: object — JSON Schema describing the expected output shape
- Returns \`{ data, error }\`: \`data\` is the parsed result (null on failure), \`error\` is the error message (undefined on success)

\`\`\`js
const { data, error } = await sampling(
  "Extract user info from: Alice is 25, alice@example.com",
  { name: "string", age: "number", email: "string" }
);
if (error) console.log("Error:", error);
else console.log(JSON.stringify(data));  // {"name":"Alice","age":25,"email":"alice@example.com"}
\`\`\`

**\`console.log(...)\`** — Print output (the only way to return values from \`exec\`).
</api>

<available_tools>
{availableTools}
</available_tools>

<parameters>
\`tool\` - "man" to inspect tool schemas, "exec" to execute code
\`args\` - For "man": { tools: ["tool1"] }. For "exec": { code: "..." }
</parameters>

<rules>
1. Use \`man\` to inspect tool schemas before calling unfamiliar tools
2. Use \`exec\` to run JavaScript; call tools with \`await tool(name, params)\` and print results with \`console.log\`
3. Always \`console.log\` sampling results — do not return them directly
</rules>`;

export const compilePrompt = p(PROMPT_TEMPLATE);
