# Launch Flow

What happens between clicking a tile and seeing pixels.

## Step-by-step

1. **Client** — `POST /api/sessions { appId }`.
2. **Go API** — verifies the user has installed the app → creates a `sessions` record with `status=starting` → spawns a container via the Docker SDK with the resolved bind mounts and env vars → labels it with `launcher.session=<sid>`.
3. **Readiness probe** — polls `http://<containerIp>:3000/` until it answers (2xx/3xx) or `SPAWN_TIMEOUT` elapses. On success, flips the record to `status=ready` and records `containerIp`/`port`.
4. **Response** — `{ id, status, url: "/s/<sid>/" }`.
5. **Client** — `window.location.href = url`.
6. **Browser hits `/s/<sid>/`** — the launcher's `httputil.ReverseProxy` resolves the session, strips the `/s/<sid>` prefix, and forwards HTTP and WebSocket traffic to `containerIp:3000`. Each forwarded request bumps an in-memory `lastActiveAt` buffer that the cleanup goroutine flushes every `CLEANUP_INTERVAL`.

A second F5 on the same `/s/<sid>/…` URL just reuses the same container — no respawn.

After `IDLE_TIMEOUT` with no traffic, the cleanup loop stops + removes the container and marks the session `stopped`.

## Sequence diagram

```
SPA              Go API             Docker            Container
 │  POST /api/sessions │                 │                 │
 │ ─────────────────► │                 │                 │
 │                    │  ContainerCreate │                 │
 │                    │ ───────────────► │                 │
 │                    │                  │  start          │
 │                    │                  │ ──────────────► │
 │                    │  GET / (poll)    │                 │
 │                    │ ────────────────────────────────► │
 │                    │  200 OK          │                 │
 │                    │ ◄──────────────────────────────── │
 │  { url: /s/abc/ }  │                  │                 │
 │ ◄─────────────────│                   │                 │
 │  GET /s/abc/*      │  proxy + strip   │                 │
 │ ─────────────────► │ ────────────────────────────────► │
 │  WS upgrade        │  passthrough     │                 │
 │ ─────────────────► │ ────────────────────────────────► │
```

## Stop

`DELETE /api/sessions/:id` (or the idle reaper) calls `ContainerStop` + `ContainerRemove` and sets the record to `status=stopped`. The SPA's session collection picks up the realtime update and unmounts the HUD overlay.

## Errors

- Spawn timeout → record flipped to `status=failed`, container is force-removed.
- Image not present locally → the launcher pulls it first and the SSE progress stream feeds the install dialog. The session only spawns once the pull completes.
- Network exhaustion (rare) → the spawn fails with a Docker error which is surfaced verbatim in the session record's `error` field.
