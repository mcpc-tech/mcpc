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

deno run -A packages/core/src/server.ts
