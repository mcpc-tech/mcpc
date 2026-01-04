import { createACPProvider } from "../src/provider.ts";
import { streamText } from "ai";
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
  console.log("🎨 Image Example (No Tools) - Starting...");

  const imageUrl =
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Google_2015_logo.svg/368px-Google_2015_logo.svg.png";

  console.log(`Fetching image from ${imageUrl}...`);
  const { data, mimeType } = await fetchImage(imageUrl);
  console.log(
    `Image fetched. Mime: ${mimeType}, Size: ${data.length} chars (base64)`,
  );

  console.log("Creating provider...");
  console.log("\n--- Streaming response ---\n");

  try {
    console.log("Calling streamText...");
    const { textStream } = streamText({
      model: provider.languageModel(
        process.env.ACP_MODEL,
        process.env.ACP_MODE,
      ),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "What is this image? Describe it in detail.",
            },
            {
              type: "image",
              image: `data:${mimeType};base64,${data}`,
            },
          ],
        },
      ],
    });

    console.log("Starting to stream text...");
    // Stream the text output
    for await (const chunk of textStream) {
      process.stdout.write(chunk);
    }

    console.log("\n\n--- Results ---");
    console.log("✅ Test complete");
  } catch (error) {
    console.error("\n❌ Error:", error);
  } finally {
    provider.cleanup();
  }
}

main().catch(console.error);
