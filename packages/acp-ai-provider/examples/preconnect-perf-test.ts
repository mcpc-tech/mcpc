import { createACPProvider } from "../src/provider.ts";
import { acpTools } from "../src/acp-tool.ts";
import { jsonSchema, streamText, tool } from "ai";
import process from "node:process";

// Helper to run a test scenario
async function runScenario(
  name: string,
  mode: boolean | "initSession",
): Promise<{ connectTime: string; ttft: string }> {
  console.log(`\n\n--- Scenario: ${name} ---`);

  // Create a fresh provider for each scenario to ensure isolation
  const provider = createACPProvider({
    command: "claude-agent-acp",
    args: [],
    session: {
      cwd: process.cwd(),
      mcpServers: [],
    },
  });

  let connectTime = "N/A";
  let ttft = "N/A";

  const testTools = acpTools({
    // calculate: tool({
    //   description: "Add two numbers",
    //   inputSchema: z.object({
    //     a: z.number(),
    //     b: z.number(),
    //   }),
    //   execute: ({ a, b }: { a: number; b: number }) => {
    //     return (a + b).toString();
    //   },
    // }),
    calculate: tool({
      description: "Add two numbers",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          a: { type: "number" },
          b: { type: "number" },
        },
        required: ["a", "b"],
      }),
      execute: ({ a, b }: { a: number; b: number }) => {
        return (a + b).toString();
      },
    }),
  });

  try {
    if (mode === true) {
      const startConnect = performance.now();
      console.log("Connecting to provider...");
      await provider.connect();
      const endConnect = performance.now();
      connectTime = (endConnect - startConnect).toFixed(2) + "ms";
      console.log(
        `✅ Connected in ${connectTime}`,
      );
    } else if (mode === "initSession") {
      const startInit = performance.now();
      console.log("Initializing session (Warmup)...");
      // Pass the same tools we will use later to avoid restart
      await provider.initSession(testTools);
      const endInit = performance.now();
      connectTime = (endInit - startInit).toFixed(2) + "ms (init)";
      console.log(
        `✅ Session Initialized in ${connectTime}`,
      );
    }
    console.log("Starting streamText...");
    const startStream = performance.now();
    let firstChunkTime = 0;

    const result = streamText({
      model: provider.languageModel(
        process.env.ACP_MODEL,
        process.env.ACP_MODE,
      ),
      onChunk: ({ chunk }) => {
        if (chunk.type === "tool-call") {
          console.log(chunk);
        }
      },
      prompt: "Use the calculate tool to calculate 123 + 456.",
      tools: testTools,
    });

    for await (const chunk of result.textStream) {
      if (firstChunkTime === 0) {
        firstChunkTime = performance.now();
        ttft = (firstChunkTime - startStream).toFixed(2) + "ms";
        console.log(
          `⚡ Time to First Token (TTFT): ${ttft}`,
        );
      }
      process.stdout.write(chunk);
    }
  } catch (err) {
    console.error(`Error in scenario ${name}:`, err);
    ttft = "Error";
  } finally {
    provider.cleanup();
  }

  return { connectTime, ttft };
}

async function main() {
  console.log("=== Performance Comparison Test ===");

  const results = [];

  // Warmup run (ignored)
  console.log("Warmup run...");
  // await runScenario("Warmup", false);
  console.log("Warmup complete.\n");

  // // Run without pre-connect (Baseline)
  // results.push({
  //   scenario: "Without Pre-connect (Baseline)",
  //   ...(await runScenario("Without Pre-connect (Baseline)", false)),
  // });

  // // Run with pre-connect (Optimized user latency)
  // results.push({
  //   scenario: "With Pre-connect (Optimized)",
  //   ...(await runScenario("With Pre-connect (Optimized)", true)),
  // });

  // Run with pre-session (Pre-warm session)
  results.push({
    scenario: "With Pre-Session (Fully Warmed)",
    ...(await runScenario("With Pre-Session (Fully Warmed)", "initSession")),
  });

  console.log("\n\n=== Comparison Complete ===");
  console.table(results);
}

main().catch(console.error);
