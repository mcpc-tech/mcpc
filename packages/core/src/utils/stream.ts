import type { TextStreamPart, ToolSet } from "ai"; // Assuming 'ai' is installed via npm/jsr for Deno
import { ServerSentEventStream } from "@std/http/server-sent-event-stream";
import type { WecomIncomingParams } from "../../mod.ts"; // Import the type

import { processBuffer } from "../middleware/imitate-tool-use.middleware.ts";
import { md } from "./common/md.ts";
import { truncateJSON } from "../../mod.ts";

/**
 * Creates a Wecom-compatible stream from an AI SDK fullStream
 * @param fullStream The fullStream from streamTextResult
 * @param params Wecom-specific parameters to include in the response
 * @returns A new ReadableStream formatted for Wecom SSE
 */
export function createWecomStreamFromFullStream(
  fullStream: ReadableStream<TextStreamPart<any>>,
  params: WecomIncomingParams
): ReadableStream<any> {
  const { msg_id, fuzzy_question, is_fuzzy } = params;

  // Buffer to accumulate text and handle tool calls
  let toolTmpBuffer = "";

  return fullStream
    .pipeThrough(
      new TransformStream<TextStreamPart<ToolSet>, any>({
        transform: (chunk, controller) => {
          const global_output = {
            urls: "",
            answer_success: 0,
            docs: [],
            context: "",
            image_urls: null,
          };

          let response = "";
          let answer_type = "answer";

          switch (chunk.type) {
            case "text-delta": {
              toolTmpBuffer += chunk.textDelta;
              const { isTool } = processBuffer(toolTmpBuffer);
              if (!isTool) {
                response = chunk.textDelta;
                answer_type = "answer";
              }
              break;
            }
            case "tool-call": {
              try {
                response =
                  "🔧 " +
                  md.code("inline")`MCP [tool-call] ${chunk.toolName}` +
                  "\n" +
                  md.code("json")`${truncateJSON(chunk.args)}` +
                  "\n";
              } catch (e) {
                response =
                  "🔧 " +
                  md.code("inline")`MCP [tool-call] ${chunk.toolName}` +
                  "\n" +
                  md.code("json")`${truncateJSON(chunk.args)}` +
                  "\n";
                console.error("Error stringifying tool args:", e);
              }
              answer_type = "answer";
              break;
            }
            // @ts-expect-error -
            case "tool-result": {
              try {
                response =
                  "🔧 " +
                  md.code("inline")`MCP [tool-result] ${
                    // @ts-expect-error -
                    chunk.toolName
                  }` +
                  "\n" +
                  md.code("json")`${truncateJSON(
                    // @ts-expect-error -
                    chunk.result
                  )}` +
                  "\n";
              } catch (e) {
                response =
                  "🔧 " +
                  md.code("inline")`MCP [tool-result] ${
                    // @ts-expect-error -
                    chunk.toolName
                  }` +
                  "\n" +
                  md.code("json")`${truncateJSON(
                    // @ts-expect-error -
                    chunk.result
                  )}` +
                  "\n";
                console.error("Error stringifying tool result:", e);
              }
              answer_type = "answer";
              break;
            }
            case "error": {
              response = `\'error\': ${
                chunk.error instanceof Error
                  ? chunk.error.message
                  : JSON.stringify(chunk.error)
              }`;
              answer_type = "answer";
              break;
            }
            case "reasoning": {
              response = chunk.textDelta;
              answer_type = "think";
              break;
            }
            case "file":
            case "source":
            case "tool-call-delta":
            case "finish":
            case "step-start":
            case "step-finish":
            case "tool-call-streaming-start":
            case "reasoning-signature":
            case "redacted-reasoning": {
              return;
            }
            default: {
              console.warn("Unhandled stream chunk type:", chunk);
              return;
            }
          }

          // Only send a response if we have content to send
          if (response.length > 0) {
            const wecomData = {
              answer_type,
              response: chunk,
              finished: false,
              global_output,
              msg_id: msg_id ?? "",
              fuzzy_question: fuzzy_question ?? null,
              is_fuzzy: is_fuzzy ? 1 : 0,
            };

            controller.enqueue({
              event: "delta",
              data: JSON.stringify(wecomData),
            });
          }
        },
        flush(controller) {
          const finalData = {
            answer_type: "answer",
            response: "",
            finished: true,
            global_output: { urls: "", answer_success: 1, docs: [] },
            msg_id: msg_id ?? "",
            fuzzy_question: fuzzy_question ?? "",
            is_fuzzy: is_fuzzy ? 1 : 0,
          };

          controller.enqueue({
            event: "delta",
            data: JSON.stringify(finalData),
          });
        },
      })
    )
    .pipeThrough(new ServerSentEventStream());
}
