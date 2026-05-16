# First use

You've run [the installer](./installation), the UI is reachable, the superuser password is on a sticky note next to your keyboard. Here's the first-time walk-through.

## 1. Create the first profile

Open the UI and click **New profile** on the profile picker.

Fill in:
- a **username** (this is what shows on the home screen)
- an **email** + **password** (used to log in next time)
- optionally a **display name** and an **accent color**

::: tip First-user privilege
The **first** user created is automatically promoted to `admin`. Everyone after them is `player`. This is intentional and one-shot: once an admin exists, the rule no longer applies.
:::

Log in. You land on the home screen.

## 2. Install your first app

The home screen has two sections:

- **Installed apps** — your launchable tiles. Empty for now.
- **Catalog** — the curated list of available apps. Admin-only; players just see the installed-apps area.

Pick an app from the catalog (Firefox is a friendly first choice — small image, no GPU strictly required). Click it.

The **install dialog** asks for:

- **App slug** — short identifier, used in paths and DB records (auto-filled, edit if you want)
- **Volume overrides** — per-mount paths if you want them somewhere other than the default `data/users/<uid>/<app>` layout (most users skip this)

Submit. The server starts pulling the image. The tile shows live progress (layer by layer) — this is realtime, no refresh needed.

When the pull finishes, the tile becomes **launchable**.

## 3. Launch a session

Click the tile. The launcher:

1. Spawns a fresh container for you
2. Waits for the container's web entry point to answer
3. Redirects you to `/s/<sessionId>/`

Within a few seconds you should see the streamed desktop. The **HUD overlay** lives in the top corner — click it (or use `Meta+Alt+O`) to open the menu and:

- Stop the session
- Toggle fullscreen (`Meta+Alt+F`)
- Adjust bitrate / framerate / audio
- Reach Selkies' own controls

## 4. Stop a session

Two ways:
- HUD → **Stop session** (`Meta+Alt+Q`)
- Just close the tab — after `IDLE_TIMEOUT` (default 30 min), the cleanup loop will reap the container

A stopped session removes the container; per-user data on disk is preserved.

## 5. Add more users

Anyone with the URL can hit **New profile** and create an account. They'll be `player` — they see installed apps and can launch them, but can't install new ones from the catalog.

To promote someone to admin, edit their record in the PocketBase admin UI (`/_/`) and set `role: admin`. Use the superuser credentials printed by the installer.

## Keyboard shortcuts cheat sheet

| Shortcut | Action |
| --- | --- |
| `Meta+Alt+O` | Toggle HUD overlay |
| `Meta+Alt+Q` | Stop current session |
| `Meta+Alt+H` | Home — back to the launcher |
| `Meta+Alt+F` | Toggle fullscreen |

Shortcuts use the **labeled letter** on the key (not the physical position), so they survive layout changes.

## Gamepad

Spatial navigation works out of the box. Layout follows **Nintendo conventions** (right face button = confirm, bottom = cancel), even on Xbox-style pads — the library treats the right button as primary regardless of label.

## What's next

- Tweak the runtime: [Configuration](./configuration)
- Keep things current: [Updating](./updating)
- Something off: [Troubleshooting](./troubleshooting)
