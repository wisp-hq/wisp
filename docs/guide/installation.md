# Installation

The installer is a single shell script. It checks Docker, detects your GPU, asks a handful of questions, writes a `docker-compose.yml` + `.env`, pulls the published launcher image, and starts the stack.

## TL;DR

```bash
curl -fsSL https://raw.githubusercontent.com/wisp-hq/wisp/main/install.sh | bash
```

::: warning Piping to `bash`
Read [`install.sh`](https://github.com/wisp-hq/wisp/blob/main/install.sh) first if you'd rather not pipe a remote script. It's ~150 lines of plain bash with no funny business.
:::

When it finishes you'll see:

```
 ✓ wisp is running

  UI:                 http://localhost:8080
  PocketBase admin:   http://localhost:8080/_/
  Superuser email:    admin@wisp.local
  Superuser password: g3X4uKQqXxN8wVHJpz9d
  GPU mode:           nvidia
  Data directory:     /home/you/wisp/data
  PB data directory:  /home/you/wisp/pb_data
```

Open the UI, create your first profile (auto-promoted to admin), and you're in. See [First use](./first-use) for the bootstrap walk-through.

## Prerequisites

The installer checks these for you, but for reference:

- **Linux host** (the launcher spawns sibling containers via `/var/run/docker.sock`; this is fundamentally a Linux-only design)
- **Docker Engine** with the **Compose v2** plugin (`docker compose version` must work)
- The current user must be in the `docker` group (or you run the installer as root)
- Optional: **GPU drivers**
  - NVIDIA: [`nvidia-container-toolkit`](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) configured and the Docker daemon restarted
  - Intel / AMD: kernel driver loaded so `/dev/dri` exists

## What the installer asks

| Prompt | Default | What it does |
| --- | --- | --- |
| GPU passthrough mode | _auto-detected_ | `nvidia` / `intel` / `amd` / `dri` / `none` — controls what gets passed to spawned containers |
| Host port | `8080` | Port the launcher listens on |
| Timezone | host's `/etc/timezone` | Set in spawned containers via `TZ` |
| PocketBase superuser email | `admin@wisp.local` | The DB-admin account (separate from your wisp user) |
| PocketBase superuser password | _auto-generated_ | Stored in `.env` (`chmod 600`) — write it down |
| Public base URL | `http://localhost:<port>` | Used by PocketBase for email/origin validation |

## GPU detection

The installer probes in this order:

1. **NVIDIA** — `nvidia-smi -L` returns at least one GPU **and** the Docker daemon advertises the `nvidia` runtime.
2. **`/dev/dri` + vendor probe** — if `/dev/dri` exists, `lspci` tells us whether it's Intel or AMD/ATI/Radeon.
3. **Fallback** — `/dev/dri` exists but vendor unknown → `dri` (generic VA-API).
4. **None** — no GPU acceleration.

You can override the detection by:

- Answering the prompt with a different value
- Pre-seeding `GPU=nvidia ./install.sh`
- Editing `.env` afterwards and running `docker compose up -d`

## Pre-seeding (non-interactive)

For unattended installs (Ansible / Nix-based provisioning / etc.), seed answers via env vars and pass `--non-interactive`:

```bash
GPU=intel \
ADMIN_EMAIL=admin@example.com \
ADMIN_PASSWORD=$(openssl rand -base64 24) \
PUBLIC_BASE_URL=https://wisp.example.com \
PORT=8080 \
./install.sh --non-interactive
```

All variables are listed in `./install.sh --help`.

## Manual install (no script)

If you prefer to wire things up yourself, the installer is just doing what you can do by hand:

```yaml
# docker-compose.yml
name: wisp

services:
  launcher:
    image: ghcr.io/wisp-hq/wisp:latest
    environment:
      TZ: Europe/Paris
      GPU: nvidia           # or intel/amd/dri/(empty)
      PB_SUPERUSER_EMAIL: admin@wisp.local
      PB_SUPERUSER_PASSWORD: change-me-please
      PUBLIC_BASE_URL: http://localhost:8080
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./pb_data:/app/pb_data
      - ./data:/data
    networks:
      - wisp
    ports:
      - "8080:8080"
    security_opt:
      - seccomp:unconfined
      - apparmor:unconfined
    shm_size: "2gb"
    restart: unless-stopped

networks:
  wisp:
```

Then `docker compose up -d`. The same env vars are documented in [Configuration](./configuration).

## Behind a reverse proxy

Most self-hosters will front wisp with their existing reverse proxy (Caddy / Traefik / Pangolin / Nginx). The launcher needs:

- HTTP forwarded to `:8080` (or whatever `PORT` you chose)
- **WebSocket upgrades** must pass through (`/s/:sessionId/*` carries the Selkies WebRTC signaling)
- `PUBLIC_BASE_URL` set to the user-facing URL (`https://wisp.example.com`)

A minimal Caddy site:

```
# Caddyfile
wisp.example.com {
    reverse_proxy launcher:8080
}
```

→ Once you're up: [First use](./first-use).
