import { createACPProvider } from "../src/provider.ts";
import { acpTools } from "../src/acp-tool.ts";
import { streamText, tool } from "ai";
import { z } from "zod";
import process from "node:process";

// Create provider for an ACP agent (using claude-code-acp as example)
const provider = createACPProvider({
  command: "claude-code-acp",
  args: [],
  session: {
    cwd: process.cwd(),
    mcpServers: [],
  },
});

const processDataSchema = z.object({
  data: z.string().describe("A very long string of data to process"),
  encoding: z.enum(["utf-8", "ascii", "base64"]).optional().describe(
    "The encoding of the input data",
  ),
  priority: z.number().min(1).max(10).describe(
    "Processing priority (1-10)",
  ),
  metadata: z.record(z.string()).optional().describe(
    "Additional metadata kv pairs",
  ),
});

async function main() {
  const prompt = process.env.PROMPT ||
    "Call the `process_data` tool with a string (at least 2000 chars), set priority to 10, encoding to utf-8, and add some metadata.";

  console.log({ prompt });
  console.log("\n--- Streaming response ---\n");

  try {
    const { textStream, steps } = streamText({
      onChunk: ({ chunk }) => {
        // We want to see the raw chunks to verify tool names in "tool-call" events
        if (chunk.type === "tool-call") {
          console.log("Tool Call Chunk:", JSON.stringify(chunk, null, 2));
        }
      },
      model: provider.languageModel(
        process.env.ACP_MODEL,
        process.env.ACP_MODE,
      ),
      prompt,
      tools: acpTools({
        process_data: tool({
          description: "Process a large amount of data",
          inputSchema: processDataSchema,
          execute: (
            { data, encoding, priority, metadata }: z.infer<
              typeof processDataSchema
            >,
          ) => {
            return `Processed ${data.length} characters of data with priority ${priority}. Encoding: ${
              encoding || "default"
            }. Metadata keys: ${Object.keys(metadata || {}).join(", ")}`;
          },
        }),
      }),
    });

    for await (const chunk of textStream) {
      process.stdout.write(chunk);
    }

    console.log("\n\n--- Results ---");
    const resultSteps = await steps;
    const toolCalls = resultSteps
      .flatMap((s) => s.toolCalls);

    console.log("Tool Calls:");
    toolCalls.forEach((tc) => {
      console.log(`- ID: ${tc.toolCallId}`);
      console.log(`- Name: ${tc.toolName}`);
      console.log(`- Type: ${tc.type}`);
      // console.log(`- Args length: ${tc.args.data?.length}`);
    });
  } catch (error) {
    console.error("\n❌ Error:", error);
  } finally {
    provider.cleanup();
  }
}

main().catch(console.error);
