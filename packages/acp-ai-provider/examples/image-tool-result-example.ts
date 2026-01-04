/**
 * Example: Test image understanding with MCP-format image content in Tool Results
 *
 * This example demonstrates how acpTools() correctly handles images returned
 * by tools in MCP CallToolResult format, preserving the image data instead of
 * JSON.stringify-ing it.
 *
 * Run: deno run -A packages/acp-ai-provider/examples/image-tool-result-example.ts
 */

import { createACPProvider } from "../src/provider.ts";
import { acpTools } from "../src/acp-tool.ts";
import { streamText, tool } from "ai";
import { z } from "zod";
import process from "node:process";
import { Buffer } from "node:buffer";

// Create provider for an ACP agent
const provider = createACPProvider({
  command: "claude-code-acp",
  args: [],
  session: {
    cwd: process.cwd(),
    mcpServers: [],
  },
});

/**
 * Helper to fetch an image from the web and converting to base64
 */
async function fetchImage(
  url: string,
): Promise<{ data: string; mimeType: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = response.headers.get("content-type") || "image/jpeg";

  return {
    data: buffer.toString("base64"),
    mimeType,
  };
}

async function main() {
  console.log("🎨 Image Understanding Test - Starting...");

  const defaultUrl =
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Google_2015_logo.svg/368px-Google_2015_logo.svg.png";
  const prompt = process.env.PROMPT ||
    `Use the fetch_web_image tool to download an image from ${defaultUrl}. Look at the image content and describe it in detail.`;

  console.log("Prompt:", prompt);
  console.log("Creating provider...");
  console.log("\n--- Streaming response ---\n");

  try {
    console.log("Calling streamText...");
    const { textStream, steps } = streamText({
      model: provider.languageModel(
        process.env.ACP_MODEL,
        process.env.ACP_MODE,
      ),
      prompt,
      tools: acpTools({
        fetch_web_image: tool({
          description: "Fetch an image from a web URL for analysis",
          inputSchema: z.object({
            url: z.string().describe("The URL of the image to fetch"),
          }),
          execute: async ({ url }) => {
            console.log(
              `\n[Tool] 🌐 Fetching image from ${url}...\n`,
            );

            try {
              const { data, mimeType } = await fetchImage(url);
              console.log(
                `[Tool] ✅ Image fetched, mime-type: ${mimeType}, base64 length: ${data.length}`,
              );

              // Return MCP CallToolResult format with image content
              const result = {
                content: [
                  {
                    type: "text" as const,
                    text: `Successfully fetched image from ${url}`,
                  },
                  {
                    type: "image" as const,
                    data: data,
                    mimeType: mimeType,
                  },
                ],
              };

              console.log(
                `[Tool] 📤 Returning result with ${result.content.length} content blocks`,
              );
              return result;
            } catch (error) {
              console.error(`[Tool] ❌ Error fetching image:`, error);
              return {
                content: [
                  {
                    type: "text" as const,
                    text: `Error fetching image: ${
                      error instanceof Error ? error.message : String(error)
                    }`,
                  },
                ],
                isError: true,
              };
            }
          },
        }),
      }),
    });

    console.log("Starting to stream text...");
    // Stream the text output
    for await (const chunk of textStream) {
      process.stdout.write(chunk);
    }

    console.log("\n\n--- Results ---");
    const resultSteps = await steps;
    const toolCalls = resultSteps.flatMap((s) => s.toolCalls).filter(Boolean);

    console.log(JSON.stringify(toolCalls, null, 2));
  } catch (error) {
    console.error("\n❌ Error:", error);
  } finally {
    provider.cleanup();
  }
}

main().catch(console.error);
