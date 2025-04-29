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

        billing-agent-app-nodejs = pkgs.stdenv.mkDerivation {
          name = "billing-agent-app";
          src = ./.;
          buildPhase = ''
            # Set up npm cache directory
            export SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt
            export NODE_EXTRA_CA_CERTS=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt
            export HOME=$(mktemp -d)
            export PATH=${pkgs.nodejs_23}/bin:$PATH  # Add this line to ensure node is in PATH
            mkdir -p $out/app
            # Install dependencies
            cd packages/agent
            ${pkgs.nodejs_23}/bin/npm install
            ${pkgs.nodejs_23}/bin/npm run build
            cd ../..
          '';
          installPhase = ''
            # Copy application files
            mkdir -p $out/app/packages/agent
            cp -r packages/agent $out/app/packages/
          '';
        };

        billing-agent-app-deno = pkgs.stdenv.mkDerivation {
          name = "billing-agent-app-deno";
          src = ./.;
          nativeBuildInputs = with pkgs; [
            deno
            nodejs_23
          ];

          buildPhase = ''
            mkdir -p $out/app
            cp -r ./* $out/app/
          '';

          installPhase = ''
            cd $out/app

            # Set DENO_DIR to build directory
            export DENO_DIR=$out/deno-dir
            export HOME=$(mktemp -d)
            export NPM_CONFIG_REGISTRY=https://mirrors.tencent.com/npm/
            mkdir -p $DENO_DIR

            # Pre-cache dependencies
            deno install --allow-scripts --allow-import --vendor --node-modules-dir 
            ${pkgs.deno}/bin/deno task -r server:compile

            # Ensure cache
            timeout 30s deno run --allow-scripts --allow-all --vendor --node-modules-dir packages/agent/src/server.ts || true
            # timeout 30s deno run --allow-scripts --allow-all --vendor --node-modules-dir packages/capi-mcp/src/stdio.server.ts || true
          '';
        };

        oapi-invoker-app-deno = pkgs.stdenv.mkDerivation {
          name = "oapi-invoker-app-deno";
          src = ./.;
          nativeBuildInputs = with pkgs; [
            deno
            nodejs_23
          ];

          buildPhase = ''
            mkdir -p $out/app
            cp -r ./* $out/app/
          '';

          installPhase = ''
            cd $out/app

            # Set DENO_DIR to build directory
            export DENO_DIR=$out/deno-dir
            export HOME=$(mktemp -d)
            export NPM_CONFIG_REGISTRY=https://mirrors.tencent.com/npm/
            mkdir -p $DENO_DIR

            # Ensure cache
            deno install --allow-scripts --allow-import --vendor --node-modules-dir 
            timeout 30s deno run --allow-scripts --allow-all --vendor --node-modules-dir packages/oapi-invoker-mcp/src/server.ts || true
          '';
        };

        code-runner-app-deno = pkgs.stdenv.mkDerivation {
          name = "code-runner-app-deno";
          src = ./.;
          nativeBuildInputs = with pkgs; [
            deno
            nodejs_23
          ];

          buildPhase = ''
            mkdir -p $out/app
            cp -r ./* $out/app/
          '';

          installPhase = ''
            cd $out/app

            # Set DENO_DIR to build directory
            export DENO_DIR=$out/deno-dir
            export HOME=$(mktemp -d)
            export NPM_CONFIG_REGISTRY=https://mirrors.tencent.com/npm/
            mkdir -p $DENO_DIR

            # Ensure cache
            deno install --allow-scripts --allow-import --vendor --node-modules-dir 
            # timeout 30s deno run --allow-scripts --allow-all --vendor --node-modules-dir packages/code-runner-mcp/src/server.ts || true
          '';
        };

        dockerImageDeno = pkgs.dockerTools.pullImage {
          imageName = "denoland/deno";
          imageDigest = "sha256:887ae28a4e699e06880ccc2e50d0a434785933907271301eac5a02f8a02ddb1b";
          sha256 = "sha256-idBGF7IxvOR7SVtxpuEcBOnTmXJ3Ap8LnZjgHmU0MFY=";
        };
      in
      {
        packages = rec {
          code-runner-image-deno = pkgs.dockerTools.buildImage {
            inherit tag;
            name = "mirrors.tencent.com/tcbteam/code-runner-mcp";
            copyToRoot = pkgs.buildEnv {
              name = "image-root";
              paths = [
                pkgs.deno
                pkgs.cacert
                pkgs.coreutils
                pkgs.bashInteractive
                pkgs.curl
                code-runner-app-deno
              ];
              pathsToLink = [
                "/bin"
                "/app"
                "/deno-dir"
              ];
            };
            config = {
              Env = [
                "PORT=9000"
                "NODE_ENV=production"
                "DENO_DIR=/deno-dir"
                "NPM_CONFIG_REGISTRY=https://mirrors.tencent.com/npm/"
                "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
              ];
              WorkingDir = "/app/packages/code-runner-mcp";
              Cmd = [
                "deno"
                "run"
                "--cached-only"
                "--allow-scripts"
                "--allow-all"
                "--vendor"
                "--node-modules-dir"
                "./src/server.ts"
              ];
              ExposedPorts = {
                "9000/tcp" = { };
              };
            };
          };

          oapi-invoker-image-deno = pkgs.dockerTools.buildImage {
            inherit tag;
            name = "mirrors.tencent.com/tcbteam/oapi-invoker-mcp";
            copyToRoot = pkgs.buildEnv {
              name = "image-root";
              paths = [
                pkgs.deno
                pkgs.cacert
                pkgs.coreutils
                pkgs.bashInteractive
                pkgs.curl
                oapi-invoker-app-deno
              ];
              pathsToLink = [
                "/bin"
                "/app"
                "/deno-dir"
              ];
            };
            config = {
              Env = [
                "PORT=9000"
                "NODE_ENV=production"
                "DENO_DIR=/deno-dir"
                "NPM_CONFIG_REGISTRY=https://mirrors.tencent.com/npm/"
                "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
              ];
              WorkingDir = "/app/packages/oapi-invoker-mcp";
              Cmd = [
                "deno"
                "run"
                "--cached-only"
                "--allow-scripts"
                "--allow-all"
                "--vendor"
                "--node-modules-dir"
                "./src/server.ts"
              ];
              ExposedPorts = {
                "9000/tcp" = { };
              };
            };
          };

          billing-agent-image-deno = pkgs.dockerTools.buildImage {
            # fromImage = dockerImageDeno;
            inherit tag;
            name = "mirrors.tencent.com/tcbteam/oapi-invoker-mcp";
            copyToRoot = pkgs.buildEnv {
              name = "image-root";
              paths = [
                pkgs.deno
                pkgs.cacert
                pkgs.coreutils
                pkgs.bashInteractive
                pkgs.curl
                billing-agent-app-deno
              ];
              pathsToLink = [
                "/bin"
                "/app"
                "/deno-dir"
              ];
            };
            config = {
              Env = [
                "PORT=9000"
                "NODE_ENV=production"
                "DENO_DIR=/deno-dir"
                "NPM_CONFIG_REGISTRY=https://mirrors.tencent.com/npm/"
                "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
              ];
              WorkingDir = "/app";
              Cmd = [
                "deno"
                "run"
                "--cached-only"
                "--allow-all"
                "--allow-scripts"
                "--vendor"
                "--node-modules-dir"
                "./packages/agent/src/server.ts"
              ];
              ExposedPorts = {
                "9000/tcp" = { };
              };
            };
          };

          billing-agent-image-nodejs = pkgs.dockerTools.buildImage {
            inherit tag;
            name = "csighub.tencentyun.com/qcbuy-frontend/billing-agent";
            copyToRoot = pkgs.buildEnv {
              name = "image-root";
              paths = [
                pkgs.nodejs_23
                pkgs.coreutils
                pkgs.bash
                billing-agent-app-nodejs
              ];
              pathsToLink = [
                "/bin"
                "/app"
              ];
            };
            config = {
              Env = [
                "NODE_ENV=production"
                "PORT=9000"
                "NPM_CONFIG_REGISTRY=https://mirrors.tencent.com/npm/"
              ];
              WorkingDir = "/app/packages/agent";
              Cmd = [
                "${pkgs.nodejs_23}/bin/node"
                "dist/src/server.js"
              ];
              ExposedPorts = {
                "9000/tcp" = { };
              };
            };
          };

          default = billing-agent-image-deno;
        };

        oapi-invoker-image-deno = self.packages.${system}.oapi-invoker-image-deno;

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs_23
            deno
            bashInteractive
          ];
          shellHook = ''
            export NPM_CONFIG_REGISTRY=https://mirrors.tencent.com/npm/
          '';
        };
      }
    );
}
