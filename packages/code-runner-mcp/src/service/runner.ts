import { spawn } from "node:child_process";
import { getPyodide, getPip, loadDeps, makeStream } from "../tool/py.ts";
import type { Buffer } from "node:buffer";
import path, { join } from "node:path";
import { mkdirSync } from "node:fs";
import process from "node:process";
import { tmpdir } from "node:os";

const projectRoot = tmpdir();
const cwd = path.join(projectRoot, ".deno_runner_tmp");

mkdirSync(cwd, { recursive: true });

// const EXEC_TIMEOUT = 1000;
const EXEC_TIMEOUT = 1000 * 60 * 1;

// Cache pyodide instance
queueMicrotask(() => {
  getPyodide();
  getPip();
});

const encoder = new TextEncoder();

/**
 * Run arbitrary Python code (Pyodide) and **stream** its stdout / stderr.
 *
 * Optional `abortSignal` will interrupt execution via Pyodide’s interrupt
 * buffer and close the resulting stream.
 */
export async function runPy(
  code: string,
  abortSignal?: AbortSignal
): Promise<ReadableStream<Uint8Array>> {
  const pyodide = await getPyodide();

  // Load packages
  await loadDeps(code);

  // Interrupt buffer to be set when aborting
  const interruptBuffer = new Int32Array(
    new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  );

  pyodide.setInterruptBuffer(interruptBuffer);

  let controller!: ReadableStreamDefaultController<Uint8Array>;

  const push =
    (prefix: string) =>
    (data: string): void => {
      controller.enqueue(encoder.encode(prefix + data));
    };

  // Build the stream with proper abort behaviour
  const stream = makeStream(
    abortSignal,
    (ctrl) => {
      console.log("[start][py] streaming & timeout");
      const timeout = setTimeout(() => {
        console.log(`[err][py] timeout`);
        controller.enqueue(encoder.encode("[err][py] timeout"));
        controller.close();
        interruptBuffer[0] = 3;
      }, EXEC_TIMEOUT);

      controller = ctrl;
      pyodide.setStdout({ batched: push("") });
      pyodide.setStderr({ batched: push("[stderr] ") });

      // Defer execution so that `start()` returns immediately
      queueMicrotask(async () => {
        try {
          // If an abort happened before execution – don’t run
          if (abortSignal?.aborted) return;
          await pyodide.runPythonAsync(code);
          clearTimeout(timeout);
          controller.close();
        } catch (err) {
          clearTimeout(timeout);
          controller.error(err);
        }
      });
    },
    () => {
      interruptBuffer[0] = 2;
    }
  );

  return stream;
}

/**
 * Run arbitrary JavaScript using Deno (must be in PATH) and **stream**
 * its stdout / stderr.  Mirrors the `runPy` API.
 */
export async function runJS(
  code: string,
  abortSignal?: AbortSignal
): Promise<ReadableStream<Uint8Array>> {
  // Launch Deno: `deno run --quiet -` reads the script from stdin
  console.log("[start][js] spawn");
  const userProvidedPermissions =
    process.env.DENO_PERMISSION_ARGS?.split(" ") ?? [];
  const selfPermissions = [`--allow-read=${cwd}/`, `--allow-write=${cwd}/`];

  // Note: --allow-* cannot be used with '--allow-all'
  const allowAll = userProvidedPermissions.includes("--allow-all");
  const proc = spawn(
    "deno",
    [
      "run",
      `--quiet`,
      ...(allowAll
        ? userProvidedPermissions
        : selfPermissions.concat(userProvidedPermissions)),
      "-",
    ],
    {
      stdio: ["pipe", "pipe", "pipe"],
      cwd,
      env: {
        ...process.env,
        DENO_DIR: join(cwd, ".deno"),
      },
    }
  );

  // Log the actual command being run
  console.log(
    `[start][js] command: deno run --quiet --allow-read="${cwd}/" --allow-write="${cwd}/" -`
  );

  // Feed provided code to Deno
  proc.stdin.write(code);
  proc.stdin.end();

  const forward =
    (controller: ReadableStreamDefaultController<Uint8Array>, prefix = "") =>
    (chunk: Buffer | string) => {
      const data =
        typeof chunk === "string"
          ? encoder.encode(prefix + chunk)
          : new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);

      // For stderr add prefix only once at beginning of line
      if (prefix) {
        controller.enqueue(encoder.encode(prefix));
      }
      controller.enqueue(data);
    };

  const stream = makeStream(
    abortSignal,
    (controller) => {
      console.log(`[start][js] cwd: ${cwd}`);
      const timeout = setTimeout(() => {
        console.log(`[err][js] timeout`);
        forward(controller)("[err][js] timeout");
        controller.close();
        proc.kill();
      }, EXEC_TIMEOUT);

      proc.stdout.on("data", forward(controller));
      proc.stderr.on("data", forward(controller, "[stderr] "));
      proc.on("close", () => {
        clearTimeout(timeout);
        if (!controller.desiredSize) return;
        controller.close();
      });
      proc.on("error", (err) => {
        clearTimeout(timeout);
        controller.error(err);
      });
    },
    () => {
      // Abort cleanup – kill the subprocess
      proc.kill();
    }
  );

  return stream;
}
