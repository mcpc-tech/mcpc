# Build

On Apple Slliocon:

```bash
nix build --impure --option system-features nixos-test,benchmark,big-parallel,kvm .#packages.aarch64-linux.default
```

Other distos:

```bash
nix build --impure .
```

# Debug

HTTP_PROXY="http://127.0.0.1:8899" deno run -A packages/agent/src/server.ts