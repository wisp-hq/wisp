# syntax=docker/dockerfile:1

# ── Client (Vite) ────────────────────────────────────────────────────────────

FROM oven/bun:1.2.22 AS client-builder

WORKDIR /src

# Workspace-aware install + Vite's tsconfig chain (client/tsconfig.json extends ../tsconfig.json).
# Skip biome.json and turbo.json: dev-only, and we invoke vite directly here.
COPY package.json bun.lock tsconfig.json ./
COPY client/package.json ./client/
COPY docs/package.json ./docs/
COPY server/package.json ./server/
COPY tauri/package.json ./tauri/

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

COPY client/ ./client/
WORKDIR /src/client
RUN bun run vite build

# ── Server (Go) ──────────────────────────────────────────────────────────────

FROM --platform=$BUILDPLATFORM golang:1.25 AS server-builder

ARG TARGETOS
ARG TARGETARCH

# ScreenScraper credentials are baked into the binary via -ldflags -X so they
# never appear in the runtime environment (no /proc/*/environ leak, no
# `docker inspect`). They're still extractable with `strings`, which is fine
# for a free third-party API key but should not be reused for anything else.
ARG SCREENSCRAPER_DEV_ID=""
ARG SCREENSCRAPER_DEV_PASSWORD=""

WORKDIR /src/server

COPY server/go.mod server/go.sum ./
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY server/ ./
# The SPA is embedded via //go:embed all:spa — drop the freshly-built dist in place.
COPY --from=client-builder /src/client/dist/ ./spa/

RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath \
        -ldflags="-s -w \
            -X 'github.com/KevinBonnoron/wisp/internal/screenscraper.devID=${SCREENSCRAPER_DEV_ID}' \
            -X 'github.com/KevinBonnoron/wisp/internal/screenscraper.devPassword=${SCREENSCRAPER_DEV_PASSWORD}'" \
        -o /out/wisp .

# ── Final image ──────────────────────────────────────────────────────────────

# Alpine instead of distroless so the entrypoint can manage user/group on first boot
# (PUID/PGID linuxserver-style) and drop to non-root before exec'ing the launcher.
FROM alpine:3.20 AS final

RUN apk add --no-cache su-exec shadow ca-certificates tzdata

WORKDIR /app

COPY --from=server-builder /out/wisp /usr/local/bin/wisp
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV PB_DATA_DIR=/app/pb_data \
    DATA_ROOT=/data \
    PUID=1000 \
    PGID=1000

VOLUME ["/app/pb_data"]
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/usr/local/bin/wisp"]
