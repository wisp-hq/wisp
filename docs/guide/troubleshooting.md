# Troubleshooting

A list of failure modes you're likely to hit, and how to get out of them. Start with logs:

```bash
docker compose logs -f launcher
```

## Installer

### `Cannot reach the Docker daemon`

Either the daemon isn't running, or your user can't talk to its socket.

```bash
sudo systemctl start docker
sudo usermod -aG docker "$USER"
newgrp docker          # apply the new group in this shell
docker info            # should succeed now
```

### `nvidia-smi found but the Docker NVIDIA runtime isn't configured`

You have the driver but not the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html). Install it, then:

```bash
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
docker info | grep -i nvidia       # should show the runtime
```

Then re-run `./install.sh`.

### GPU was misdetected

Edit `.env`:

```bash
GPU=intel    # or nvidia / amd / dri / none
```

Then:

```bash
docker compose up -d
```

Already-running sessions keep their old GPU config until you stop them.

## Container won't start

`docker compose up -d` returns, but `docker compose ps` shows `Restarting` or `Exit 1`.

```bash
docker compose logs launcher | tail -50
```

Common causes:

- **Port already in use** — change `PORT` in `.env` and `docker compose up -d`.
- **`/var/run/docker.sock` not accessible** — the host's docker socket might be on a non-default path (some podman/rootless setups). Adjust the volume mount in `docker-compose.yml`.
- **PB migration error** — the log will reference a specific migration name. File an issue with the log; in the meantime you can pin to the previous image tag (see [Updating → Rolling back](./updating#rolling-back)).

## I can't log in / I forgot my password

### Wisp user (the profile you created)

The PocketBase admin UI lets you reset any user's password. Use the **superuser credentials** printed by the installer (or whatever you set as `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`):

1. Open `<PUBLIC_BASE_URL>/_/`
2. Log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`
3. Collections → `users` → edit the row → set a new password

### Superuser (the DB admin)

If you've lost the superuser password too:

```bash
docker compose exec launcher /usr/local/bin/wisp superuser upsert <email> <new-password>
```

`upsert` either creates or updates, so it's safe to run.

## Sessions don't launch

### "Spawn timeout" in the session record

The launcher polled the spawned container for 30 s (the default `SPAWN_TIMEOUT`) and never got a 2xx/3xx from its web entry point. Causes:

- The app's image is large and slow to start (e.g. Steam on first launch) — bump `SPAWN_TIMEOUT` in `docker-compose.yml`:
  ```yaml
  environment:
    SPAWN_TIMEOUT: 90s
  ```
- The image actually crashed on boot — `docker logs <container>` on the spawned container (find its ID with `docker ps -a --filter label=launcher.session`).

### "EACCES" / "permission denied" pulling images

The launcher hits Docker via the bind-mounted socket. The entrypoint should add the launcher user to the socket's group automatically — if it failed, check the launcher's logs for a line like:

```
addgroup: Bad group name
```

Workaround: `chmod 666 /var/run/docker.sock` on the host (insecure on a shared machine; fine on a single-user home server).

### Stream connects but is laggy / no audio

This is a Selkies / WebRTC question, not really a wisp one. Open the HUD in-session and:

- Drop the **bitrate** if you're on Wi-Fi.
- Drop the **framerate** for static apps (Firefox is fine at 30 fps).
- Make sure your **`GPU` mode** is correct. Software encode tops out fast.

## Disk fills up

Two suspects:

- `data/users/<uid>/…` — per-user app data. Browser caches especially balloon. Safe to wipe a specific app's directory if the user is okay losing its state.
- Docker's image cache — stopped session containers are removed by the reaper, but **images** aren't. Use `docker image prune` to clear unused ones. Active app images stay.

## "Where do I find logs for a single session?"

The reverse proxy logs in the launcher capture HTTP/WS traffic per session id. The spawned container's stdout is on Docker:

```bash
# session id from /s/<sid>/
docker ps -a --filter "label=launcher.session=<sid>"
docker logs <container-id>
```

## Still stuck?

Open an issue at [github.com/wisp-hq/wisp/issues](https://github.com/wisp-hq/wisp/issues) with:

- the output of `docker compose ps`
- the last ~50 lines of `docker compose logs launcher`
- your `.env` with the password redacted
- what you were doing when it broke
