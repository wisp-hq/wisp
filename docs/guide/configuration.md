# Configuration

Every setting is an environment variable on the launcher container. The installer writes the common ones to `.env`; you can edit that file and run `docker compose up -d` to apply changes.

## What you usually edit

| Variable | Default | What it does |
| --- | --- | --- |
| `GPU` | _(auto)_ | GPU passthrough mode. See [GPU](#gpu-passthrough) below. |
| `PORT` | `8080` | Host port the launcher listens on. Maps to container's `:8080`. |
| `TZ` | host's | Timezone applied inside the launcher container. |
| `ADMIN_EMAIL` | `admin@wisp.local` | PocketBase superuser email. |
| `ADMIN_PASSWORD` | _generated_ | PocketBase superuser password. |
| `PUBLIC_BASE_URL` | `http://localhost:8080` | User-facing URL. PocketBase uses it for email/origin validation; must match what users actually type. |

After editing `.env`:

```bash
docker compose up -d
```

(Just `up -d`, not `down`. Compose will recreate the container if env changed.)

## Less common knobs

These pass straight through to the launcher binary. Add them to the `environment:` section of `docker-compose.yml`:

| Variable | Default | What it does |
| --- | --- | --- |
| `HTTP_ADDR` | `:8080` | Bind address inside the container (you usually don't touch this) |
| `PB_DATA_DIR` | `/app/pb_data` | PocketBase SQLite + uploads inside the container |
| `DATA_ROOT` | `/data` | Root for per-user bind mounts inside the container |
| `HOST_DATA_ROOT` | _(auto-detected via Docker self-inspect)_ | Manual override for the **host-side** path of `DATA_ROOT`. Only needed if auto-detect fails. |
| `DOCKER_NETWORK` | `launcher-net` | Docker network spawned containers join |
| `IDLE_TIMEOUT` | `30m` | Idle window before a session gets reaped |
| `CLEANUP_INTERVAL` | `60s` | Reaper tick frequency |
| `SPAWN_TIMEOUT` | `30s` | How long we wait for a fresh container to answer HTTP |
| `DEV_MODE` | `false` | Skip the embedded SPA handler (only relevant in dev with Vite) |

## GPU passthrough

| `GPU` value | What it does |
| --- | --- |
| `nvidia` | Spawned containers get `--gpus all` + the standard `NVIDIA_VISIBLE_DEVICES` / `NVIDIA_DRIVER_CAPABILITIES` env. Requires [`nvidia-container-toolkit`](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) on the host. |
| `intel` | Bind-mounts `/dev/dri` and sets Intel-specific env. VA-API works for video decode/encode. |
| `amd` | Bind-mounts `/dev/dri`. Same shape as `intel` minus the Intel env hints. |
| `dri` | Generic `/dev/dri` passthrough — use when your hardware is unusual or the vendor probe failed. |
| _(empty)_ | No acceleration. Streaming works (software encode) but quality + CPU usage will suffer. |

To change it later:

```bash
# in .env
GPU=nvidia
```

Then `docker compose up -d`. Any **already-running** session container keeps its old GPU config until you stop it.

## Data layout on the host

With defaults, your install directory ends up looking like:

```
.
├── .env                    # generated config (chmod 600)
├── docker-compose.yml
├── pb_data/                # PocketBase: SQLite + uploads
└── data/
    ├── users/
    │   ├── <uid-1>/
    │   │   ├── firefox/    # per-user, per-app mount
    │   │   └── steam/
    │   └── <uid-2>/
    └── shared/
        └── games/          # read-only mounts available to apps
```

Apps declare which subdirectories they want via `volumeConfig` in the [catalog](https://github.com/wisp-hq/wisp/blob/main/client/src/catalog.ts). You can drop content into `data/shared/...` and it'll show up read-only inside spawned containers.

## Reverse proxy

If you front wisp with Caddy / Traefik / Pangolin / Nginx:

- forward HTTP to the launcher's port
- **WebSocket upgrades must pass through** (the Selkies WebRTC signaling rides those)
- set `PUBLIC_BASE_URL` to the user-facing URL (`https://wisp.example.com`)

A minimal Caddy site:

```
# Caddyfile
wisp.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

## Sanity-check current config

```bash
docker compose config           # show effective compose (env-substituted)
docker compose exec launcher env | grep -E 'GPU|DATA|TIMEOUT|PB_'
```
