# see -> https://github.com/denoland/deno/issues/19961

{
  description = ''
    Billing agent server Docker images
      # on Apple Silicon      
      nix build --impure --option system-features nixos-test,benchmark,big-parallel,kvm .#packages.aarch64-linux.default
      nix build .#packages.aarch64-linux.default
      nix build .#packages.x86_64-linux.default
      nix build .#packages.aarch64-darwin.default
      nix build .#packages.x86_64-darwin.default
  '';

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        tag =
          let
            envTag = builtins.getEnv "TAG";
          in
          if envTag != "" then envTag else "latest";
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            deno
            bashInteractive
          ];
          shellHook = ''
          '';
        };
      }
    );
}
