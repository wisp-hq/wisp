# Development setup

This page is for contributors who want to run wisp from source. If you just want to run wisp, head over to [Installation](../guide/installation) — the published image and the install script are enough.

## Cloning + dev shell

```bash
git clone https://github.com/wisp-hq/wisp
cd wisp
```

All commands assume you're inside the Nix devshell:

```bash
nix develop          # or `direnv allow` once
```

Bun, Go, Docker CLI, and the rest are pinned by [`flake.nix`](https://github.com/wisp-hq/wisp/blob/main/flake.nix).

## Common tasks

| Command | What it does |
| --- | --- |
| `bun dev` | Runs the client (Vite, `:5173`) and server (Go, `:8080`) in parallel via Turbo |
| `bun run --cwd client build` | Builds the SPA into `server/spa/` so the Go binary embeds it |
| `bun run --cwd docs dev` | VitePress dev server for these docs on `:5000` |
| `bun run --cwd docs build` | Static build of the docs into `docs/.vitepress/dist` |
| `cd server && go test ./...` | Server tests |
| `bun run lint` | Biome lint + format check across the monorepo |

## Editing the catalog

App entries live in [`client/src/catalog.ts`](https://github.com/wisp-hq/wisp/blob/main/client/src/catalog.ts). Each entry declares its image, default env, and `volumeConfig` (which paths get per-user vs read-only shared mounts). Adding an entry is a code change; installation per user is done via the install dialog in the UI.

## PocketBase migrations

Collection schema lives in Go under [`server/migrations/`](https://github.com/wisp-hq/wisp/tree/main/server/migrations). Run them automatically on server start, or manually:

```bash
cd server && go run . migrate up
```

When changing a collection shape, also update [`client/src/lib/types.ts`](https://github.com/wisp-hq/wisp/blob/main/client/src/lib/types.ts) so the client collections stay typed correctly.

## i18n

Strings live in [`client/src/lib/i18n/`](https://github.com/wisp-hq/wisp/tree/main/client/src/lib/i18n). The detector picks up `navigator.language` and the profile dialog exposes a manual override.

## Keyboard shortcuts

Shortcuts use `event.key` (the labeled letter) rather than `event.code` (the physical position) so AZERTY/QWERTY layouts both work. The HUD listens via the Keyboard API where available, with a `keydown` fallback.

## Gamepad layout

The confirm/cancel mapping follows Nintendo conventions: right face button = confirm, bottom face button = cancel. This is intentional even on Xbox-style pads, because the spatial nav library treats the right button as the "primary" action regardless of label.

## Building the Docker image

The repo's `docker-compose.yml` builds from source (vs the install script's compose which pulls from GHCR):

```bash
docker compose build
docker compose up -d
```

The Dockerfile is multi-stage: Bun builds the SPA → Go builds the server binary (with the SPA embedded) → Alpine final image. See [`docker/Dockerfile`](https://github.com/wisp-hq/wisp/blob/main/docker/Dockerfile).

CI ([`.github/workflows/docker.yml`](https://github.com/wisp-hq/wisp/blob/main/.github/workflows/docker.yml)) builds and pushes `linux/amd64` + `linux/arm64` to `ghcr.io/wisp-hq/wisp` on every `main` push and tag.

## Releasing the docs

GitHub Pages picks up `docs/.vitepress/dist` via [`.github/workflows/docs.yaml`](https://github.com/wisp-hq/wisp/blob/main/.github/workflows/docs.yaml). The workflow triggers on pushes to `main` that touch `docs/**`, or manually via `workflow_dispatch`.
