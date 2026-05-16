#!/bin/sh
set -e

PUID=${PUID:-1000}
PGID=${PGID:-1000}
PB_DATA_DIR=${PB_DATA_DIR:-/app/pb_data}
DATA_ROOT=${DATA_ROOT:-/data}

if [ -n "$TZ" ] && [ -f "/usr/share/zoneinfo/$TZ" ]; then
    cp "/usr/share/zoneinfo/$TZ" /etc/localtime
    echo "$TZ" > /etc/timezone
fi

if ! getent group wisp >/dev/null; then
    addgroup -g "$PGID" wisp
else
    groupmod -o -g "$PGID" wisp
fi

if ! getent passwd wisp >/dev/null; then
    adduser -D -H -u "$PUID" -G wisp wisp
else
    usermod -o -u "$PUID" -g "$PGID" wisp
fi

# When /var/run/docker.sock is mounted, the launcher needs the socket's group to
# talk to the daemon. Create a matching group inside the container and add wisp to it.
if [ -S /var/run/docker.sock ]; then
    SOCK_GID=$(stat -c '%g' /var/run/docker.sock)
    if [ "$SOCK_GID" != "0" ] && [ "$SOCK_GID" != "$PGID" ]; then
        if ! getent group dockerhost >/dev/null; then
            addgroup -g "$SOCK_GID" dockerhost 2>/dev/null || addgroup dockerhost
        fi
        addgroup wisp dockerhost 2>/dev/null || true
    fi
fi

mkdir -p "$PB_DATA_DIR" "$DATA_ROOT"
chown -R wisp:wisp "$PB_DATA_DIR" "$DATA_ROOT"

# su-exec with a `user:group` spec skips initgroups(), so supplementary groups —
# including dockerhost — are wiped. Without dockerhost, /var/run/docker.sock dials
# return EACCES and image pulls hang. Pass user only to keep the supplementary set.
exec su-exec wisp "$@"
