import { assertEquals, assertStringIncludes } from "@std/assert";
import { fileURLToPath } from "node:url";

const examplePath = fileURLToPath(
  new URL("../examples/client-sampling-example.ts", import.meta.url),
);
const simpleServerPath = fileURLToPath(
  new URL("../examples/simple_server.ts", import.meta.url),
);

Deno.test({
  name:
    "client-sampling example integration - runs against simple_server with live sampling",
  async fn() {
    const apiKey = Deno.env.get("AI_GATEWAY_API_KEY");
    if (!apiKey) {
      console.log(
        "Skipping live sampling integration test: AI_GATEWAY_API_KEY is not set.",
      );
      return;
    }

    const maxAttempts = 3;
    let lastOutput = "";
    let lastCode = -1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const command = new Deno.Command("deno", {
        args: ["run", "-A", examplePath],
        cwd: "/Users/beet/github-repo/mcpc",
        env: {
          ...Deno.env.toObject(),
          AI_GATEWAY_API_KEY: apiKey,
          MCP_SAMPLING_SERVER_PATH: simpleServerPath,
          MCP_SAMPLING_TOOL_NAME: "ask-agent",
          MCP_SAMPLING_TOOL_ARGS: JSON.stringify({
            question:
              "What is 15 + 27? You MUST call the add tool with a=15 and b=27, and your final answer must explicitly include both 'add' and '42'.",
          }),
        },
      });

      const { code, stdout, stderr } = await command.output();
      const combined = new TextDecoder().decode(stdout) +
        new TextDecoder().decode(stderr);

      lastCode = code;
      lastOutput = combined;

      const passed = code === 0 &&
        combined.includes("Connected to MCP server with sampling support.") &&
        combined.includes("42") && combined.toLowerCase().includes("add");

      if (passed) {
        assertEquals(code, 0);
        assertStringIncludes(
          combined,
          "Connected to MCP server with sampling support.",
        );
        assertStringIncludes(combined, "42");
        assertStringIncludes(combined.toLowerCase(), "add");
        return;
      }
    }

    assertEquals(lastCode, 0, lastOutput);
    assertStringIncludes(
      lastOutput,
      "Connected to MCP server with sampling support.",
    );
    assertStringIncludes(lastOutput, "42");
    assertStringIncludes(lastOutput.toLowerCase(), "add");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
