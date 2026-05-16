{
  description = "wisp — Selkies launcher development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          # JS / client side
          bun

          # Go server
          go
          gopls
          delve
          gotools
          air

          # Rust / Tauri
          rustc
          cargo
          rustfmt
          clippy
          rust-analyzer
          pkg-config

          # Tauri 2 Linux runtime/build deps
          glib
          gtk3
          webkitgtk_4_1
          librsvg
          libsoup_3
          openssl
          dbus
          cairo
          pango
          atk
          gdk-pixbuf
          harfbuzz

          # tooling
          docker-client
          docker-compose
        ];

        shellHook = ''
          export GOFLAGS="-mod=mod"

          # Tauri needs webkit2gtk + libsoup via pkg-config
          export PKG_CONFIG_PATH="${pkgs.webkitgtk_4_1.dev}/lib/pkgconfig:${pkgs.libsoup_3.dev}/lib/pkgconfig:$PKG_CONFIG_PATH"

          # Workaround for webkit2gtk DMABUF issues on some GPUs (safe default in dev)
          export WEBKIT_DISABLE_DMABUF_RENDERER=1

          if [ ! -d "$PWD/node_modules" ]; then
            echo "→ Installing JS dependencies..."
            bun install
          fi
        '';
      };
    };
}
