# Introduction

**wisp** is a self-hosted, multi-user launcher for [Selkies](https://github.com/selkies-project/selkies-gstreamer) containers. Run it on any Linux box with Docker, and your household / team / friend group gets:

- a **profile picker** at the front door,
- a **curated catalog** of containerised desktop apps (Firefox, Steam, RetroArch, …),
- a **per-user isolated container** when someone clicks Launch,
- a **WebRTC stream** of that container's desktop in their browser.

Everything sits behind a single reverse-proxy upstream, so you only expose one port.

The UI is designed to be usable on desktop, mobile, and 10-foot TV setups (gamepad navigation, large hit targets), but it doesn't try to mimic any specific console.

## Why you might want this

- You have a beefy home server with a GPU and a few users who'd like to run their own Firefox / RetroArch / Steam sessions without taking turns on the host.
- You want one URL to give to family that handles auth, app installation and streaming without each user touching shell.
- You don't want a public cloud streaming service holding your saves.

## What you need

- A Linux host (bare-metal, VM, or a NAS that runs Docker) with:
  - **Docker Engine** + the **Compose v2** plugin
  - A reachable Docker daemon (you can run `docker info` as your user)
  - Optionally: an **NVIDIA / Intel / AMD GPU** for hardware-accelerated streaming
- A web browser on whatever device you'll be streaming to (anything modern works — WebRTC + WebGL).

That's it. The installer takes care of the rest.

## Highlights

- **Multi-user profiles** with per-user data volumes. First user to register is promoted to `admin`; subsequent users are `player`.
- **Curated app catalog**. Admins install entries from the home screen — no PocketBase admin trip required for normal use.
- **Live everything**: home screen, session status, image-pull progress are all driven by realtime updates — no manual refetching.
- **Gamepad-friendly spatial nav**; keyboard shortcuts (`Meta+Alt+O/Q/H/F`) that work on any layout.
- **In-session HUD overlay** — open menu, stop session, toggle fullscreen, adjust bitrate/framerate/audio without leaving the app.
- **i18n** (English + French) with auto-detection and a language picker.
- **Installable PWA**.
- **Themeable** per-user accent colors with live preview.

## What sits where on the launcher

| URL path | Purpose |
| --- | --- |
| `/` | Profile picker → home → catalog |
| `/api/sessions/…` | Spawn / stop / inspect session containers |
| `/api/apps/…` | Image-update trigger + image-pull progress |
| `/api/collections/…` | PocketBase (auth, profiles, app records) |
| `/_/…` | PocketBase admin UI |
| `/s/:sessionId/…` | Reverse proxy to a streamed session container |

## Out of scope (for the v1)

- Multi-host / cluster orchestration (one Docker daemon assumed)
- GPU sharing logic (passes through whatever the host gives the spawned container)
- TURN server (LAN-only WebRTC is the assumption)
- Cloud sync of save files
- Multiple concurrent sessions per user (max one active at a time)
- Session sharing / co-op (designed, not yet implemented)

## Ready?

→ [Install wisp](./installation)
