# wisp 🌬️

**A multi-user launcher for [Selkies](https://github.com/selkies-project/selkies-gstreamer) containers.** Pick a profile, browse a catalog of containerised desktop apps (Firefox, Steam, RetroArch, …), launch them in your own isolated Docker container, and stream the desktop to any browser over WebRTC — all behind a single reverse-proxy upstream.

The UI is profile-tile based and designed to be usable on desktop, mobile, and 10-foot TV setups (gamepad navigation, large hit targets), but it doesn't try to mimic any specific console.

---

## Highlights

- **Multi-user profiles** with per-user data volumes. First user to register is promoted to `admin`; subsequent users are `player`.
- **Curated app catalog** ([`client/src/catalog.ts`](client/src/catalog.ts)). Admins install entries from the home screen — no PocketBase admin trip required for normal use.
- **Live everything**: home screen, session status, image-pull progress are all driven by PocketBase realtime via TanStack DB collections — no manual refetching.
- **Gamepad-friendly spatial nav** powered by `@noriginmedia/norigin-spatial-navigation`; keyboard shortcuts (`Meta+Alt+O/Q/H/F`) work on any layout via the Keyboard API.
- **In-session HUD overlay** rendered as an iframe over the streamed container — open menu, stop session, toggle fullscreen, adjust bitrate/framerate/audio without leaving the app.
- **i18n** (English + French) with auto-detection and a language picker in the profile dialog.
- **Installable PWA** with offline-aware install banner.
- **Themeable** per-user accent colors with live preview.

## What's in the box

| Path on the launcher | Served by | Purpose |
| --- | --- | --- |
| `/` | Embedded React SPA | Profile picker → home → catalog |
| `/api/sessions/…` | Custom Go handlers | Spawn / stop / inspect session containers |
| `/api/apps/…` | Custom Go handlers | Image-update trigger + SSE progress streams |
| `/api/collections/…`, `/api/users/…` | PocketBase (embedded as a Go lib) | Auth, profiles, app records |
| `/_/…` | PocketBase admin UI | Advanced management of users + apps |
| `/s/:sessionId/…` | Internal reverse proxy | HTTP + WebSocket pass-through to a session container |

> Note on the spec: the original brief mentioned a `/pb` prefix for PocketBase, but mounting PB under a sub-path breaks its hard-coded asset paths in the admin UI. Instead, PB and the custom API share `/api/*` with non-overlapping sub-paths (`/api/sessions`, `/api/apps`, … own; `/api/collections`, `/api/users`, … PocketBase's).

## Architecture

```
                              ┌──────────────────────────────┐
   browser ──── /s/abc/* ────►│ wisp (one container)         │
                              │ ┌──────────────────────────┐ │
                              │ │ Go HTTP server (:8080)   │ │
                              │ │  ├─ /api/sessions  (Go)  │ │
                              │ │  ├─ /api/apps     (Go)   │ │
                              │ │  ├─ /api/collections (PB)│ │
                              │ │  ├─ /_/ admin UI    (PB) │ │
                              │ │  ├─ /s/<id>/* → proxy ───┼─┼─► spawned container
                              │ │  └─ / → SPA (embed)      │ │   (linuxserver/firefox,
                              │ └──────────────────────────┘ │    steam, …)
                              │ /var/run/docker.sock ◄───────┼── spawns via Docker SDK
                              └──────────────────────────────┘
```

Each spawned session container:
- joins the shared `launcher-net` Docker network so the launcher can reach it by IP
- is labelled `launcher.session=<sid>`, `launcher.user=<uid>`, `launcher.app=<slug>` so cleanup can find it
- gets per-user bind mounts (`/data/users/<uid>/...`) and read-only shared mounts (`/data/shared/games`, …) according to the app's `volumeConfig`
- receives `BASE_URL=/s/<sid>` so Selkies emits correctly-prefixed asset paths (the proxy also strips the prefix as a fallback)

The cleanup goroutine reaps any session whose `lastActiveAt` is older than `IDLE_TIMEOUT` (default 30 min) and removes orphan containers left over from previous launcher boots.

## Stack

| Layer | Tech |
| --- | --- |
| Server | **Go 1.25**, [PocketBase](https://pocketbase.io) as a library, Docker SDK |
| Client | React 19, TanStack Router, TanStack Query, TanStack DB, TanStack Form, Tailwind v4, shadcn/ui, i18next |
| Build | Bun + Vite for the client, Go embed for the SPA, Turbo + Biome for monorepo plumbing |
| Dev shell | Nix flake (`nix develop` or direnv) |

## Layout

```
.
├── client/                  # React + Vite
│   └── src/
│       ├── routes/          # TanStack Router (file-based)
│       ├── components/
│       │   ├── atoms/       # Generic UI atoms (form-utils, pickers, banners, …)
│       │   ├── auth/        # Login, profile, password dialogs
│       │   ├── home/        # Home screen, app tile, install dialog, top bar
│       │   ├── hud/         # In-session HUD overlay + tabs
│       │   └── ui/          # shadcn primitives
│       ├── collections/     # TanStack DB collections wired to PocketBase
│       ├── clients/         # Typed wrappers around the Go API endpoints
│       ├── mutations/       # Pure mutation functions (collection.insert/delete, …)
│       ├── hooks/           # Reusable hooks (use-session, use-launch-session, …)
│       ├── providers/       # React contexts (auth, query, theme accent)
│       └── lib/             # i18n, PB client, types, spatial-nav, themes
├── server/                  # Go module
│   ├── main.go
│   ├── migrations/          # PocketBase collection migrations (Go)
│   ├── internal/
│   │   ├── api/             # /api/sessions + /api/apps handlers
│   │   ├── config/          # env var loader
│   │   ├── docker/          # Docker SDK wrapper
│   │   ├── sessions/        # spawn/stop lifecycle, last-active buffer, image status
│   │   ├── proxy/           # /s/:id/* HTTP + WebSocket proxy
│   │   ├── progress/        # SSE pull-progress streams
│   │   ├── cleanup/         # idle reaper + boot reconciler
│   │   └── static/          # SPA fallback handler
│   └── spa/                 # populated by `cd client && bun run build`
├── docker/
│   ├── Dockerfile           # multi-stage: bun build → go build → distroless
│   └── caddy/Caddyfile      # dev reverse proxy that simulates Pangolin
├── docker-compose.yml
├── turbo.json
└── flake.nix
```

---

## Getting started — local dev (no compose)

```bash
# 0. Enter the dev shell (or use direnv)
nix develop

# 1. Install JS deps
bun install

# 2. Start both servers in parallel (turbo runs Vite on :5173 and the Go server on :8080).
#    Vite proxies /api, /_, /s back to the Go server.
bun dev

# 3. Browser
open http://localhost:5173
```

### First-time bootstrap

1. Open <http://localhost:5173>.
2. Click **New profile** → fill the form. The first user created is automatically promoted to `admin`.
3. Log in with your fresh profile.
4. The home page shows the admin-only catalog grid below your (empty) installed apps. Pick an app → fill the install dialog → submit. The server starts pulling the image immediately; progress shows on the tile.
5. Once the pull finishes the tile becomes launchable.

If you need direct DB access (resetting a password, editing volume configs, etc.), the PocketBase admin UI is at <http://localhost:8080/_/>. Create a superuser first:

```bash
cd server && go run . superuser upsert admin@wisp.local 'change-me'
```

Superusers are PB-only — they're not the same thing as wisp `admin` users.

---

## Getting started — full stack with Docker

```bash
docker compose up --build
```

Then:
- <http://localhost> — through the Caddy "external" reverse proxy (Pangolin stand-in)
- <http://localhost:8080> — direct to the launcher

The `pb_data` directory is bind-mounted next to the compose file so superuser creation survives rebuilds. Per-user data lives in the named volume `launcher-data`.

To create a PocketBase superuser inside the running container:
```bash
docker compose exec launcher /usr/local/bin/wisp superuser upsert admin@wisp.local 'change-me'
```

---

## Configuration

Every setting is an env var on the launcher container.

| Variable | Default | What it does |
| --- | --- | --- |
| `HTTP_ADDR` | `:8080` | Bind address of the launcher HTTP server |
| `PB_DATA_DIR` | `./pb_data` (dev) / `/app/pb_data` (Docker) | PocketBase SQLite + uploads |
| `DATA_ROOT` | `/data` | Root for per-user bind mounts (relative `hostPath` resolves to `DATA_ROOT/users/<uid>/<path>`) |
| `HOST_DATA_ROOT` | _(auto-detected via Docker self-inspect)_ | Manual override for the host-side path of `DATA_ROOT`. Auto-detection works whenever wisp runs in a container with a stable hostname; this env var is only needed if the auto-detect fails. |
| `GPU` | _(empty)_ | GPU passthrough for spawned containers. `nvidia` uses the NVIDIA container toolkit (`--gpus all` + `NVIDIA_*` env). `intel`, `amd`, or `dri` bind-mounts `/dev/dri` for VA-API. Empty disables acceleration. |
| `DOCKER_NETWORK` | `launcher-net` | Docker network spawned containers join |
| `IDLE_TIMEOUT` | `30m` | Idle window before a session gets reaped |
| `CLEANUP_INTERVAL` | `60s` | Reaper tick frequency |
| `SPAWN_TIMEOUT` | `30s` | How long we wait for a fresh container to answer HTTP |
| `PUBLIC_BASE_URL` | `http://localhost:8080` | PocketBase email/origin validation |
| `DEV_MODE` | `false` | Skip the embedded SPA handler (Vite serves the client) |

---

## How a launch works

1. SPA: `POST /api/sessions { appId }`.
2. Go API: verifies the user has installed the app → creates a `sessions` record with `status=starting` → spawns a container via the Docker SDK with the resolved bind mounts and env vars → labels it with `launcher.session=<sid>`.
3. Polls `http://<containerIp>:3000/` until it answers (2xx/3xx) or `SPAWN_TIMEOUT` elapses. On success, flips the record to `status=ready` and records `containerIp`/`port`.
4. Response: `{ id, status, url: "/s/<sid>/" }`.
5. SPA: `window.location.href = url`.
6. Browser hits `/s/<sid>/`. The launcher's `httputil.ReverseProxy` resolves the session, strips the `/s/<sid>` prefix, and forwards HTTP and WebSocket traffic to `containerIp:3000`. Each forwarded request also bumps an in-memory `lastActiveAt` buffer that the cleanup goroutine flushes every `CLEANUP_INTERVAL`.

A second F5 on the same `/s/<sid>/…` URL just reuses the same container — no respawn.

After `IDLE_TIMEOUT` with no traffic, the cleanup loop stops + removes the container and marks the session `stopped`.

---

## Type sharing

The client used to import types from a `shared/` workspace generated by TypeScript. With the server in Go, the source of truth is the PocketBase collections themselves; the client's collection types live in [client/src/lib/types.ts](client/src/lib/types.ts) and are kept in sync by hand whenever a migration in `server/migrations/` changes a shape. This is intentionally low-tech — there are only a few collections and they change rarely.

---

## Out of scope (for the v1)

- Multi-host / cluster orchestration (one Docker daemon assumed)
- GPU sharing logic (passes through whatever the host gives the spawned container)
- TURN server (LAN-only WebRTC is the assumption)
- Cloud sync of save files
- Multiple concurrent sessions per user (max one active at a time)
- Session sharing / co-op (designed, not yet implemented — see the planning notes)

## License

MIT
