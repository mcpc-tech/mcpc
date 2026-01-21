import { mcpcLegacy as mcpc } from "../../mod.ts";

Deno.test(
  "Tool warning system - shows warning for non-existent tools",
  async () => {
    // Capture console output
    const originalError = console.error;
    const warnings: string[] = [];
    console.error = (...args: any[]) => {
      warnings.push(args.join(" "));
    };

    try {
      // Create server with non-existent tool reference
      const server = await mcpc(
        [
          { name: "test-agent", version: "1.0.0" },
          { capabilities: { tools: { listChanged: true } } },
        ],
        [
          {
            name: "test-agent",
            description: `
          This agent uses some tools:
          <tool name="non_existent_tool"/>
          <tool name="another_missing_tool"/>
        `,
            deps: {
              mcpServers: {
                // Empty deps - no actual tools available
              },
            },
          },
        ],
      );

      // Verify warnings were generated
      if (warnings.length === 0) {
        throw new Error("Should generate warnings");
      }

      const warningText = warnings.join("\n");
      if (!warningText.includes("Tool matching warnings")) {
        throw new Error("Should contain warning header");
      }
      if (!warningText.includes("non_existent_tool")) {
        throw new Error("Should mention first missing tool");
      }
      if (!warningText.includes("another_missing_tool")) {
        throw new Error("Should mention second missing tool");
      }
      if (!warningText.includes("Available tools:")) {
        throw new Error("Should show available options");
      }

      console.log("✅ Warning system test passed");
      console.log("Generated warnings:", warnings);

      await server.close();
    } finally {
      // Restore console.error
      console.error = originalError;
    }
  },
);
