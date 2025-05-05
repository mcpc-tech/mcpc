# Code Runner MCP

[![smithery badge](https://smithery.ai/badge/@mcpc-tech/mcpc)](https://smithery.ai/server/@mcpc-tech/mcpc)

[![JSR](https://jsr.io/badges/@mcpc/code-runner-mcp)](https://jsr.io/@mcpc/code-runner-mcp)

Run JavaScript/Python code in a secure sandbox with support for `any package import`.

<img src="./logo.png" width="300" height="300" alt="code-runner-logo">

**Use Cases:**

- Let AI quickly test if an npm/python package meets your requirements!
- Use AI to run code for logic verification, reducing hallucinations!
- Have AI write and execute testable functions for you!
- ...and so much more!

> Try it out online using [smithery.ai](https://smithery.ai/server/@mcpc-tech/mcpc/tools)

**Core Capabilities:**

- **Secure Sandbox:** Code runs in an isolated environment with strict limitations on file system, network, and environment variable access, preventing malicious code from affecting the host environment.
- **Multi-language Support:** Execute JavaScript/TypeScript and Python code snippets with ease!
- **Import Any Package:** Dynamically import and use external libraries in your code (specific support depends on the chosen runtime).

> Please note: First-time package imports require installation time, so please be patient! Subsequent runs will use cached packages, skipping the installation step.
> Inspired by https://ai.pydantic.dev/mcp/run-python/ project, we've reimplemented it with simplified package installation and added JavaScript support! 🚀✨
> Project repository: https://github.com/mcpc-tech/mcpc/tree/main/packages/code-runner-mcp - Issues and PRs welcome!

# How to Use

If you have Node.js installed locally, configure:

```json
{
  "mcpServers": {
    "code-runner": {
      "command": "npx",
      "args": [
        "-y",
        "deno",
        "run",
        "--allow-all",
        "jsr:@mcpc/code-runner-mcp/bin"
      ],
      "env": {
        "DENO_PERMISSION_ARGS": "--allow-net"
      },
      "transportType": "stdio"
    }
  }
}
```

If you have Deno installed locally, configure:

```json
{
  "mcpServers": {
    "code-runner": {
      "command": "deno",
      "args": ["run", "--allow-all", "jsr:@mcpc/code-runner-mcp/bin"],
      "env": {
        "DENO_PERMISSION_ARGS": "--allow-net"
      },
      "transportType": "stdio"
    }
  }
}
```

Notes:

- **Use the DENO_PERMISSION_ARGS environment variable to declare additional permissions for JS/TS execution. By default, no execution permissions are granted. For example, `--allow-env --allow-net` adds environment variable and network permissions. Check out [Security and permissions](https://docs.deno.land/runtime/manual/permissions) for more details!**

- **Execution Environment**

  ```bash
  # To get current environment's language versions, you can ask AI about it:
  Get current typescript, deno version and python version by running code.
  ```

# Implementation Details

> TL;DR: We use [Deno](https://deno.land/) runtime to execute JavaScript/TypeScript code snippets with support for any package import, and [Pyodide](https://pyodide.org/) with WebAssembly technology to run Python code snippets!

# JavaScript/TypeScript -> `deno run`

1. **Execution Environment:** Leveraging the awesome [Deno](https://deno.land/) runtime to execute JavaScript and TypeScript.
2. **Native TypeScript Support:** Run TypeScript (`.ts`) files directly without any extra compilation steps!
3. **Dynamic Imports & Dependency Management:**
   - Full support for ES module standards, import dependencies directly from URLs!
   - Import npm packages using the `npm:` specifier - Deno downloads and caches dependencies on first use, no manual `npm install` needed!
4. **Strict Permission Policy:** Deno takes a security-first approach, requiring explicit authorization via command line flags (like `--allow-read`, `--allow-net`, `--allow-env`) for file, network, and environment access. This runs your code in a hardened sandbox, effectively preventing potential security risks.

> Use the DENO_PERMISSION_ARGS environment variable to declare additional permissions like `--allow-env --allow-net`. Check out [Security and permissions](https://docs.deno.com/runtime/fundamentals/security/) for more details!

### Python -> `pyodide`

1. **Execution Environment:** Using [Pyodide](https://pyodide.org/) to compile the CPython interpreter to WebAssembly (WASM). Code runs in a WASM virtual machine, isolated from the host system.
2. **Browser/WASM Sandbox:** Running in a WebAssembly sandbox environment provides excellent isolation naturally!
3. **Package Management (`micropip`):**
   - Pyodide comes with the built-in `micropip` tool.
   - Install many pure Python packages and specially-built scientific packages (like NumPy, Pandas) at runtime using `micropip.install()` directly from PyPI!
   - **Note:** Not all PyPI packages can be installed directly, especially those with C extensions not yet ported to the Emscripten/Pyodide ecosystem.
4. **Client-side/Isolated Execution:** Run Python code in browser environments or standalone WASM runtimes (like Wasmer, Wasmtime), avoiding the overhead and complexity of starting separate Python processes for each request on a server.
5. **Python Version:** Pyodide typically binds to a specific CPython version (e.g., Pyodide 0.25.x is based on Python 3.11).

### Key Advantages & Use Cases

- **Security:** Provides crucial safety guarantees when executing code snippets from users or other untrusted sources.
- **Flexibility:** Allows dynamic execution of custom logic, data processing, and computational tasks in AI Agents, automated workflows, or online code editors.
- **Convenience:** Simplifies environment setup for running simple scripts and dynamically loading libraries.

### Important Considerations

- **Performance:** Sandboxing (especially WebAssembly) may introduce some performance overhead compared to native execution.
- **Package Compatibility:**
  - Deno's compatibility with Node.js built-in modules and some npm packages might not be complete.
  - Pyodide's `micropip` can't install all PyPI packages, with C extension dependencies being the main limitation.
- **Resource Limitations:** Sandbox environments typically impose limits on memory usage, execution time, and other resources.
- **Permission Management (Deno):** Carefully configure permissions for Deno to balance functional requirements with security minimization principles.
