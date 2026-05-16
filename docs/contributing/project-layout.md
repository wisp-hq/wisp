# Project Layout

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
├── docs/                    # VitePress (this site)
├── docker/
│   ├── Dockerfile           # multi-stage: bun build → go build → distroless
│   └── caddy/Caddyfile      # dev reverse proxy that simulates Pangolin
├── docker-compose.yml
├── turbo.json
└── flake.nix
```

## Where to look for…

| If you want to… | Look at |
| --- | --- |
| Add a new app | [`client/src/catalog.ts`](https://github.com/wisp-hq/wisp/blob/main/client/src/catalog.ts) |
| Change a PB collection shape | [`server/migrations/`](https://github.com/wisp-hq/wisp/tree/main/server/migrations) + [`client/src/lib/types.ts`](https://github.com/wisp-hq/wisp/blob/main/client/src/lib/types.ts) |
| Change session spawn behaviour | [`server/internal/sessions/`](https://github.com/wisp-hq/wisp/tree/main/server/internal/sessions) |
| Change the reverse proxy | [`server/internal/proxy/`](https://github.com/wisp-hq/wisp/tree/main/server/internal/proxy) |
| Tweak the HUD overlay | [`client/src/components/hud/`](https://github.com/wisp-hq/wisp/tree/main/client/src/components/hud) |
| Add a keyboard shortcut | [`client/src/hooks/`](https://github.com/wisp-hq/wisp/tree/main/client/src/hooks) |
| Edit the docs | [`docs/`](https://github.com/wisp-hq/wisp/tree/main/docs) |
