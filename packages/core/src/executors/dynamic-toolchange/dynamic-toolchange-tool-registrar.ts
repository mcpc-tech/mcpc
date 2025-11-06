/**
 * Dynamic Tool Change Tool Registrar
 *
 * Registers an agent tool that can dynamically enable/disable tools
 * and notify clients when the tool list changes.
 */

import { jsonSchema, type Schema } from "../../utils/schema.ts";
import type { RegisterToolParams } from "../../types.ts";
import { createGoogleCompatibleJSONSchema } from "../../utils/common/provider.ts";
import type { ComposableMCPServer } from "../../compose.ts";
import { CompiledPrompts } from "../../prompts/index.ts";
import { DynamicToolChangeExecutor } from "./dynamic-toolchange-executor.ts";

export function registerDynamicToolChangeTool(
  server: ComposableMCPServer,
  {
    description,
    name,
    allToolNames,
    toolNameToDetailList,
  }: RegisterToolParams,
) {
  // Create executor
  const executor = new DynamicToolChangeExecutor(
    name,
    allToolNames,
    toolNameToDetailList,
    server,
  );

  // Enhance description with dynamic tool change instructions
  description = CompiledPrompts.autonomousExecution({
    toolName: name,
    description:
      `${description}\n\n**Dynamic Tool Change Mode - IMPORTANT**\nThis agent can dynamically enable tools as needed:\n- The 'action' field is REQUIRED - you MUST select a tool first\n- Use 'enable_tools' array to activate additional tools when you need more capabilities\n- Enabling tools triggers client notifications and makes them available immediately\n\n⚠️ DO NOT guess parameters! Always select an 'action' first.\n\nThis helps manage tool overload and improves performance by loading tools on demand.`,
  });

  // Create schema supporting both tool execution and management
  const argsDef: Schema<Record<PropertyKey, never>>["jsonSchema"] = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: allToolNames,
        description:
          "REQUIRED: The action/tool to execute from currently enabled tools. You MUST select an action first.",
      },
      parameters: {
        type: "object",
        description: "The parameters for the selected action.",
        additionalProperties: true,
      },
      enable_tools: {
        type: "array",
        items: { type: "string", enum: allToolNames },
        description:
          "Optional: Array of tool names to enable for future use. Enabled tools will be available in subsequent calls.",
      },
    },
    required: ["action"],
  };

  const schema = allToolNames.length > 0
    ? argsDef
    : { type: "object", properties: {} };

  server.tool(
    name,
    description,
    jsonSchema<Record<string, unknown>>(
      createGoogleCompatibleJSONSchema(schema as Record<string, unknown>),
    ),
    async (args: Record<string, unknown>) => {
      return await executor.execute(
        args,
        schema as Record<string, unknown>,
      );
    },
  );
}
