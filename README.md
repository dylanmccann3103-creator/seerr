<p align="center">
<img src="./public/logo_full.svg" alt="Seerr" style="margin: 20px 0;">
</p>

**Seerr for Whisparr** is a request manager for adult content, forked from
[Seerr](https://github.com/seerr-team/seerr). Users browse scenes, sites and
performers from [ThePornDB](https://theporndb.net), request them, and the
request is sent to a single [Whisparr](https://whisparr.com) instance — either
API version: v2 (sites/seasons, TPDB-keyed) or v3 (scene-only, StashDB-keyed),
chosen in Settings. Availability is read back from your library through
[Stash](https://stashapp.cc) and/or [Jellyfin](https://jellyfin.org).

Everything movie/TV/Plex/Radarr/Sonarr/TMDB related from upstream Seerr has
been removed. The app makes no calls to GitHub or any telemetry endpoint; the
only outbound traffic is to ThePornDB, your Whisparr, Stash, Jellyfin, and —
only if you use Whisparr v3 — StashDB, plus the notification agents you
configure.

## Features

- Discover and search scenes, sites and performers (ThePornDB).
- Request a single scene or whole years of a site (v2) or a single scene
  (v3); requests are dispatched to Whisparr exactly once and failures are
  shown with a reason and can be retried.
- Whisparr v3 support: a scene is resolved to its StashDB ID (direct link, or
  a studio/date/title search fallback) and added as a v3 "movie". Existing
  requests can be migrated to v3 in bulk from Settings.
- Library scan via Whisparr, with availability confirmed against Stash
  (path match) and/or Jellyfin.
- Jellyfin or local accounts, permissions, quotas, issues, notifications
  (Discord, email, Telegram, Pushover, Pushbullet, Gotify, ntfy, Slack,
  webhook, web push).
- Local image cache for all ThePornDB artwork.

## Getting started

Requirements: Whisparr (v2 or v3), a ThePornDB API key, Stash and/or Jellyfin,
and — only for Whisparr v3 — a [StashDB](https://stashdb.org) API key.
Storage is **SQLite only**. This fork needs a **fresh database**: do not point
it at an existing Seerr/Overseerr/Jellyseerr `config` directory.

### Docker

```sh
cp .env.example .env      # fill in TPDB_API_KEY
docker compose up -d      # http://localhost:5056
```

`compose.yaml` builds the image, publishes port 5056, mounts `./config` for
the database, settings and image cache, and reads `.env`.

### Environment variables

| Variable | Purpose |
|---|---|
| `TPDB_API_KEY` | ThePornDB API key. Optional if set in Settings → Services. |
| `PORT` | Listen port inside the container (default 5055). |
| `HOST` | Bind address (default all interfaces). |
| `CONFIG_DIRECTORY` | Config/database directory (default `config`). |
| `TZ` | Time zone used for logs and scheduled jobs. |
| `LOG_LEVEL` | `debug`, `info` (default), `warn`, `error`. |

### First run

1. Open the app and finish the setup wizard: create the admin account (Jellyfin
   sign-in or a local account) and, if you use Jellyfin, pick the libraries to
   scan.
2. Settings → Services: enter the Whisparr connection, quality profile and root
   folder; enable Stash and add path mappings if Whisparr and Stash see the
   library under different paths; set the ThePornDB key if not in `.env`.
3. Settings → Jobs: run the Whisparr scan once to import what the library
   already has.

Modes: Stash only, Jellyfin only, or both. A scene becomes *available* only
when a configured library reports the file.

## Development

```sh
pnpm install
pnpm dev                 # http://localhost:5055
pnpm typecheck && pnpm lint && pnpm test
```

`compose.dev.yaml` runs the same in a container. See `CLAUDE.md` for a map of
the codebase and `PLAN.md` / `PROGRESS.md` for how the fork was built.

## License

Same as upstream Seerr, see [LICENSE](./LICENSE).
