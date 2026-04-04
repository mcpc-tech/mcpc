import { assertEquals } from "@std/assert";
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import { convertAiSdkMessagesToAcp } from "../src/convert-utils.ts";

function createCallOptions(
  content: Array<{
    type: "file";
    data: string | Uint8Array | URL;
    mediaType: string;
  }>,
): LanguageModelV3CallOptions {
  return {
    prompt: [
      {
        role: "user",
        content,
      },
    ],
  } as LanguageModelV3CallOptions;
}

Deno.test("convertAiSdkMessagesToAcp converts string image file parts to ACP image blocks", () => {
  const options = createCallOptions([
    {
      type: "file",
      data: "data:image/png;base64,Zm9v",
      mediaType: "image/png",
    },
  ]);

  const result = convertAiSdkMessagesToAcp(options, true);

  assertEquals(result, [
    {
      type: "image",
      mimeType: "image/png",
      data: "Zm9v",
    },
  ]);
});

Deno.test("convertAiSdkMessagesToAcp converts Uint8Array image file parts to ACP image blocks", () => {
  const options = createCallOptions([
    {
      type: "file",
      data: new Uint8Array([102, 111, 111]),
      mediaType: "image/png",
    },
  ]);

  const result = convertAiSdkMessagesToAcp(options, true);

  assertEquals(result, [
    {
      type: "image",
      mimeType: "image/png",
      data: "Zm9v",
    },
  ]);
});
