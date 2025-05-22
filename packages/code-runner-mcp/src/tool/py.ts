import { loadPyodide, type PyodideInterface } from "pyodide";

let pyodideInstance: Promise<PyodideInterface> | null = null;

export const getPyodide = async (): Promise<PyodideInterface> => {
  if (!pyodideInstance) {
    pyodideInstance = loadPyodide({});
  }
  return pyodideInstance;
};

export const getPip = async () => {
  const pyodide = await getPyodide();
  await pyodide.loadPackage("micropip", { messageCallback: () => {} });
  const micropip = pyodide.pyimport("micropip");
  return micropip;
};

export const loadDeps = async (code: string) => {
  const pyodide = await getPyodide();
  // Filter out built-in modules and already available modules
  const [imports, _availableModules] = pyodide
    .runPython(
      `import pyodide, pkgutil, sys
imports_found = pyodide.code.find_imports(${JSON.stringify(code)})
pkgutil_available = {module.name for module in pkgutil.iter_modules()}
builtin_available = set(sys.builtin_module_names)
all_available_modules = pkgutil_available.union(builtin_available)
importable_modules = sorted([
    imp for imp in imports_found
    if imp not in all_available_modules
])
final_available_list = sorted(list(all_available_modules))
result = [importable_modules, final_available_list]
result`
    )
    .toJs();

  const pip = await getPip();
  await pip.install(imports);
};

/**
 * Create a ReadableStream wired up with abort-handling.
 *
 * `onAbort` may be supplied to perform additional cleanup
 * (e.g. kill a child process, set Pyodide interrupt buffer, …).
 */
export function makeStream(
  abortSignal: AbortSignal | undefined,
  onStart: (controller: ReadableStreamDefaultController<Uint8Array>) => void,
  onAbort?: () => void
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      onStart(controller);

      if (abortSignal) {
        // If already aborted – trigger immediately
        if (abortSignal.aborted) {
          controller.error(
            abortSignal.reason ?? new Error("Operation aborted")
          );
          onAbort?.();
          return;
        }

        // Otherwise listen for future aborts
        abortSignal.addEventListener(
          "abort",
          () => {
            controller.error(
              abortSignal.reason ?? new Error("Operation aborted")
            );
            onAbort?.();
          },
          { once: true }
        );
      }
    },
  });
}
