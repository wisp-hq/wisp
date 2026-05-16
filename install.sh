#!/usr/bin/env bash
# wisp installer — detects GPU, writes config, starts the stack.
# Usage:
#   ./install.sh                    # interactive
#   ./install.sh --non-interactive  # accept all defaults
#   GPU=nvidia ./install.sh         # pre-seed answers via env vars

set -euo pipefail

WISP_IMAGE="${WISP_IMAGE:-ghcr.io/wisp-hq/wisp:latest}"
INSTALL_DIR="${INSTALL_DIR:-$PWD}"
NON_INTERACTIVE=0
for arg in "$@"; do
    case "$arg" in
        -y|--yes|--non-interactive) NON_INTERACTIVE=1 ;;
        -h|--help)
            cat <<EOF
wisp installer

Usage: ./install.sh [options]

Options:
  -y, --yes, --non-interactive   Accept defaults / pre-seeded env values without prompting
  -h, --help                     Show this help

Pre-seed answers via env vars:
  GPU={nvidia|intel|amd|dri|none}   GPU passthrough mode (default: auto-detected)
  PORT=8080                         Host port the launcher listens on
  ADMIN_EMAIL=admin@wisp.local      PocketBase superuser email
  ADMIN_PASSWORD=...                PocketBase superuser password (auto-generated otherwise)
  TZ=Europe/Paris                   Timezone for the launcher container
  INSTALL_DIR=\$PWD                  Where to write docker-compose.yml + .env
  WISP_IMAGE=ghcr.io/wisp-hq/wisp:latest
EOF
            exit 0
            ;;
    esac
done

c_blue=$'\033[1;34m'
c_green=$'\033[1;32m'
c_yellow=$'\033[1;33m'
c_red=$'\033[1;31m'
c_dim=$'\033[2m'
c_reset=$'\033[0m'

log()  { printf "%s==>%s %s\n" "$c_blue"  "$c_reset" "$*"; }
ok()   { printf "%s ✓%s %s\n"   "$c_green" "$c_reset" "$*"; }
warn() { printf "%s ⚠%s %s\n"   "$c_yellow" "$c_reset" "$*"; }
err()  { printf "%s ✗%s %s\n"   "$c_red"   "$c_reset" "$*" 1>&2; }
hint() { printf "%s   %s%s\n"  "$c_dim"  "$*" "$c_reset"; }

# ── prompts ──────────────────────────────────────────────────────────────────

ask() {
    local label="$1" default="${2:-}" reply
    if [ "$NON_INTERACTIVE" = 1 ]; then
        printf "%s\n" "$default"; return
    fi
    if [ -n "$default" ]; then
        read -r -p "$label [$default]: " reply </dev/tty || reply=""
    else
        read -r -p "$label: " reply </dev/tty || reply=""
    fi
    printf "%s\n" "${reply:-$default}"
}

ask_secret() {
    local label="$1" default="${2:-}" reply
    if [ "$NON_INTERACTIVE" = 1 ]; then
        printf "%s\n" "$default"; return
    fi
    if [ -n "$default" ]; then
        read -r -s -p "$label [hidden, enter to keep generated]: " reply </dev/tty || reply=""
    else
        read -r -s -p "$label: " reply </dev/tty || reply=""
    fi
    printf "\n" 1>&2
    printf "%s\n" "${reply:-$default}"
}

random_password() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -base64 18 | tr -d '/+=' | cut -c1-20
    else
        head -c 24 /dev/urandom | base64 | tr -d '/+=' | cut -c1-20
    fi
}

# ── prerequisites ────────────────────────────────────────────────────────────

log "Checking prerequisites"

if ! command -v docker >/dev/null 2>&1; then
    err "Docker is not installed. Install Docker Engine + Compose v2 first: https://docs.docker.com/engine/install/"
    exit 1
fi
ok "docker found ($(docker --version))"

if ! docker compose version >/dev/null 2>&1; then
    err "Docker Compose v2 is required (the 'docker compose' subcommand). Update Docker or install the compose plugin."
    exit 1
fi
ok "docker compose v2 found"

if ! docker info >/dev/null 2>&1; then
    err "Cannot reach the Docker daemon. Is it running? Are you in the 'docker' group?"
    hint "sudo systemctl start docker  &&  sudo usermod -aG docker \$USER  &&  newgrp docker"
    exit 1
fi
ok "docker daemon reachable"

# ── GPU detection ────────────────────────────────────────────────────────────

detect_gpu() {
    if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L 2>/dev/null | grep -q "GPU"; then
        if docker info 2>/dev/null | grep -qi "nvidia"; then
            printf "nvidia\n"; return
        fi
        warn "nvidia-smi found but the Docker NVIDIA runtime isn't configured."
        hint "Install nvidia-container-toolkit and restart Docker, then re-run."
    fi

    if [ -e /dev/dri ]; then
        local vendor=""
        if command -v lspci >/dev/null 2>&1; then
            vendor=$(lspci -nn 2>/dev/null | grep -iE 'vga|3d|display' | head -1 || true)
        fi
        case "$vendor" in
            *Intel*|*intel*) printf "intel\n"; return ;;
            *AMD*|*ATI*|*Radeon*|*amd*|*ati*) printf "amd\n"; return ;;
            *) printf "dri\n"; return ;;
        esac
    fi

    printf "none\n"
}

log "Detecting GPU"
detected_gpu="$(detect_gpu)"
ok "detected: ${detected_gpu}"

# ── interactive answers ──────────────────────────────────────────────────────

log "Configuration"

GPU="${GPU:-$(ask "GPU passthrough mode (nvidia|intel|amd|dri|none)" "$detected_gpu")}"
case "$GPU" in nvidia|intel|amd|dri|none) ;; *)
    err "Invalid GPU mode '$GPU'. Use nvidia, intel, amd, dri, or none."
    exit 1
;; esac

PORT="${PORT:-$(ask "Host port" "8080")}"
TZ="${TZ:-$(ask "Timezone" "$(cat /etc/timezone 2>/dev/null || echo Europe/Paris)")}"
ADMIN_EMAIL="${ADMIN_EMAIL:-$(ask "PocketBase superuser email" "admin@wisp.local")}"

generated_password="$(random_password)"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(ask_secret "PocketBase superuser password (enter to keep generated)" "$generated_password")}"

PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-$(ask "Public base URL (used for PB email/origin validation)" "http://localhost:${PORT}")}"

# ── write files ──────────────────────────────────────────────────────────────

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

log "Writing $INSTALL_DIR/.env"
cat > .env <<EOF
# wisp configuration — generated by install.sh on $(date -u +%FT%TZ)
WISP_IMAGE=${WISP_IMAGE}
PORT=${PORT}
TZ=${TZ}
GPU=${GPU}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
PUBLIC_BASE_URL=${PUBLIC_BASE_URL}
EOF
chmod 600 .env
ok ".env written"

compose_file="$INSTALL_DIR/docker-compose.yml"
if [ -f "$compose_file" ] && grep -q "^name: wisp" "$compose_file" 2>/dev/null && grep -q "build:" "$compose_file" 2>/dev/null; then
    warn "Existing docker-compose.yml builds from source — leaving it untouched."
    hint "To use the published image instead, move it aside and re-run install.sh."
else
    log "Writing $compose_file"
    cat > "$compose_file" <<'EOF'
name: wisp

services:
  launcher:
    image: ${WISP_IMAGE}
    environment:
      TZ: ${TZ}
      GPU: ${GPU}
      PB_SUPERUSER_EMAIL: ${ADMIN_EMAIL}
      PB_SUPERUSER_PASSWORD: ${ADMIN_PASSWORD}
      PUBLIC_BASE_URL: ${PUBLIC_BASE_URL}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./pb_data:/app/pb_data
      - ./data:/data
    networks:
      - wisp
    ports:
      - "${PORT}:8080"
    security_opt:
      - seccomp:unconfined
      - apparmor:unconfined
    shm_size: "2gb"
    restart: unless-stopped

networks:
  wisp:
EOF
    ok "docker-compose.yml written"
fi

# ── pull + start ─────────────────────────────────────────────────────────────

log "Pulling ${WISP_IMAGE}"
docker compose pull launcher

log "Starting the stack"
docker compose up -d launcher

# ── summary ──────────────────────────────────────────────────────────────────

printf "\n"
ok "wisp is running"
printf "\n"
printf "  UI:                 %s\n" "$PUBLIC_BASE_URL"
printf "  PocketBase admin:   %s/_/\n" "$PUBLIC_BASE_URL"
printf "  Superuser email:    %s\n" "$ADMIN_EMAIL"
printf "  Superuser password: %s\n" "$ADMIN_PASSWORD"
printf "  GPU mode:           %s\n" "$GPU"
printf "  Data directory:     %s/data\n" "$INSTALL_DIR"
printf "  PB data directory:  %s/pb_data\n" "$INSTALL_DIR"
printf "\n"
hint "Credentials are stored in $INSTALL_DIR/.env (chmod 600). Keep it safe."
hint "Stop the stack with:  docker compose down"
hint "View logs with:       docker compose logs -f launcher"
hint "Update with:          docker compose pull && docker compose up -d"
