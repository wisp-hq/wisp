# HTTP Surface

Everything is served by the single Go process on `HTTP_ADDR`. Sub-paths are dispatched by prefix.

## Custom Go handlers

### Sessions

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/sessions` | Spawn a session for the calling user. Body: `{ appId }`. Returns `{ id, status, url }`. |
| `GET` | `/api/sessions/:id` | Fetch the session record. |
| `DELETE` | `/api/sessions/:id` | Stop + remove the container. Idempotent. |

The session lifecycle is documented in [Launch Flow](./launch-flow).

### Apps

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/apps/:id/update` | Trigger an image pull/refresh. Admin-only. |
| `GET` | `/api/apps/:id/progress` | Server-Sent Events stream of image-pull progress (layer-level). |

## PocketBase

PB owns everything under `/api/collections`, `/api/users`, `/_/` (admin UI), and other PB internals. The custom Go routes are mounted on `/api/sessions` and `/api/apps`, which don't overlap.

::: tip Why not `/pb`?
The original brief mentioned a `/pb` prefix, but mounting PB under a sub-path breaks its hard-coded asset paths in the admin UI. Splitting `/api/*` between PB and the custom handlers turned out cleaner.
:::

## Session proxy

| Method | Path | Purpose |
| --- | --- | --- |
| `*` | `/s/:sessionId/*` | Reverse-proxies HTTP and WebSocket traffic to the container at `containerIp:3000`. Strips the `/s/:sessionId` prefix before forwarding. Touches the `lastActiveAt` buffer on every request. |

## SPA fallback

Any path that doesn't match the above is served by the embedded SPA handler ([`server/internal/static`](https://github.com/wisp-hq/wisp/tree/main/server/internal/static)). In `DEV_MODE=true` this fallback is skipped — Vite owns `/`.
