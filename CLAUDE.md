# CLAUDE.md — codebase map (Seerr for Whisparr)

Fork of Seerr turned into a request manager for Whisparr. Next.js frontend (`src/`)
+ Express/TypeORM backend (`server/`), one process. Path aliases: `@server/*` → `server/`,
`@app/*` → `src/`. **SQLite only.** No TMDB/Radarr/Sonarr/Plex code remains; do not
re-introduce any (whisparr-v3.ts borrows Radarr's known *shape* as a reference comment
only — no Radarr code or deps). Outbound traffic is limited to ThePornDB, Whisparr,
Stash, StashDB, Jellyfin and user-configured notification agents (no GitHub update
check, no telemetry).

Whisparr has two API shapes, chosen per-install via `settings.whisparr.apiVersion`
('v2' default, 'v3'): v2 is Sonarr-shaped (sites/seasons/episodes); v3 is Radarr-shaped
(one scene = one "movie", keyed by a StashDB id instead of TMDB). v3 has no sites/seasons
— SITE-type requests always use v2 and error out if apiVersion is 'v3'.

## 1. External services

| File | Role |
|---|---|
| `server/api/externalapi.ts` | Base HTTP class (axios, proxy, rate limit, cache). Everything below extends it. |
| `server/api/tpdb/` | ThePornDB client: scenes, sites, performers, search. Key = `settings.tpdb.apiKey` or `TPDB_API_KEY`. Cache id `tpdb`. |
| `server/api/servarr/whisparr.ts` | Whisparr v2 client (Sonarr v3 shape). `tvdbId` on a series **is the TPDB site id**; `tvdbId` on an episode is the TPDB scene `_id`; seasons are calendar years; lookup prefix is `tpdb:<id>`. Cache id `whisparr`. |
| `server/api/servarr/whisparr-v3.ts` | Whisparr v3 client (Radarr-shaped "movie" = scene). Keyed by `foreignId` (StashDB uuid); lookup prefix `stash:<id>`. **Unverified against a live v3 instance** — built from Radarr's known contract, see the file's header comment. Cache id `whisparr` (shared). |
| `server/api/servarr/base.ts` | Shared Servarr surface (`buildUrl`, profiles, root folders, tags, commands). |
| `server/api/stash/` | Stash GraphQL client (`findSceneByPath`) — the user's own local Stash library, for availability path matching. Not StashDB. |
| `server/api/stashdb/` | Public stashdb.org GraphQL client (`ApiKey` header), v3-only: resolves a scene to its StashDB id by studio+date+title when it has no direct link. Cache id `stashdb`. |
| `server/lib/whisparrV3.ts` | `resolveStashId()` (TPDB scene -> StashDB id: direct link in `scene.links` first, then StashDB search) and `sendSceneToWhisparrV3()` (resolve + add-or-skip), shared by the per-request dispatch and the bulk migration. |
| `server/lib/whisparrV3Migration.ts` | `migrateWhisparrRequestsToV3()` — admin action behind `POST /api/v1/settings/whisparr/migrate-v3`, walks every non-declined/non-completed scene request and (re)sends it via the v3 client. |
| `server/api/jellyfin.ts` | Jellyfin/Emby auth, users, libraries, item paths. |
| `server/routes/imageproxy.ts` + `server/lib/imageproxy.ts` | `/imageproxy/tpdb/<cdn|thumb>/…` with a two-host allowlist; `CachedImage` (`type="tpdb"|"avatar"`) rewrites TPDB URLs to it when `cacheImages` is on. |

Mapping layer `server/models/{Scene,Site,Performer,Search}.ts` turns raw TPDB into the public
API shapes. Routes never return raw TPDB.

## 2. Request flow

```
POST /api/v1/request                          server/routes/request.ts
  └─ MediaRequest.request() → requestLock → createWhisparrRequest()   server/entity/MediaRequest.ts
       TPDB validation (getScene/getSite) → find/create Media → dedupe → SeasonRequest[] (years) → save
            ↓ TypeORM subscriber
     MediaRequestSubscriber.afterInsert/afterUpdate → sendToWhisparr()   server/subscriber/MediaRequestSubscriber.ts
       exactly-once via conditional UPDATE on sentToServiceAt; failure → FAILED + failureReason (retry resends)
       scene: addSite → poll /episode for TPDB _id → /episode/monitor (+ EpisodeSearch if searchOnRequest)
       site : addSite with requested year seasons
```

`MediaSubscriber` propagates Media/Season status back to requests (COMPLETED when available).
`server/lib/downloadtracker.ts` polls the Whisparr queue into `Media.downloadStatus`.

## 3. Library scan / availability

One job, `whisparr-scan`, dispatched by `server/lib/scanners/activeWhisparr.ts` to
whichever scanner matches `apiVersion`:

- v2: `server/lib/scanners/whisparr/` is the single writer for SITE/SCENE media: sites →
  SITE rows + year seasons, file-bearing episodes → SCENE rows (`tpdbId` = episode
  `tvdbId`, `tmdbId = 0` placeholder, `externalServiceId` = episode id). Also runs orphan
  cleanup (vanished media → DELETED; orphaned approved requests → DECLINED).
- v3: `server/lib/scanners/whisparrV3/` only *updates* SCENE rows already matched by
  `externalServiceId` (the v3 movie id) — it doesn't discover untracked scenes (no
  StashDB->TPDB reverse lookup) or run orphan cleanup (would wrongly orphan v2-tracked
  rows after a version switch, since both share the SCENE mediaType).

`server/lib/scanners/library.ts` maps Whisparr file paths through per-library path mappings
and asks Stash and/or Jellyfin; a title is AVAILABLE only when a library has the file.

## 4. Data model

TypeORM, `server/datasource.ts`. `Media` (`tpdbId` varchar + partial unique index with
`mediaType`; `status`; `serviceId`/`externalServiceId`/`externalServiceSlug`; `jellyfinMediaId`),
`Season` (year), `MediaRequest` (`status`, `type`, `failureReason`, `sentToServiceAt`, overrides
`profileId`/`rootFolder`/`tags`), `SeasonRequest`, `User` (local or Jellyfin; no Plex fields),
`UserSettings`, `Issue`/`IssueComment`, `DiscoverSlider`, `Session`, `UserPushSubscription`.

`MediaType` still declares `movie`/`tv` alongside `scene`/`site` (helpers `isSeasonal`,
`isSingleItem`, `isWhisparrType` in `server/constants/media.ts`); only scene/site are created.
Leftover tables without routes: `blocklist`, `watchlist`, `override_rule`.

Migrations: `server/migration/sqlite/` only. Dev sqlite uses `synchronize: true`; production runs
migrations at startup. `server/lib/settings/migrations/` is the separate `settings.json` migrator.

## 5. Settings

`server/lib/settings/index.ts`: `whisparr` (single server: hostname/port/ssl/baseUrl/apiKey,
profile, root folder, `monitorNewItems`, `searchOnRequest` default **false**, `tagRequests`,
`apiVersion` ('v2'|'v3', default 'v2'), `stashDbApiKey` (v3 fallback lookup),
`searchOnAddV3` default **false**), `stash` (`url`, `apiKey`, `pathMappings` — the user's
own Stash library, for availability), `jellyfin` (+ `pathMappings`), `tpdb.apiKey`,
`main` (no `versionCheck`, no 4K flags). Routes: `server/routes/settings/{whisparr,stash}.ts`
(`POST .../whisparr/migrate-v3` is the admin-only bulk resend-to-v3 action).
UI: `src/components/Settings/{SettingsWhisparr,SettingsStash,SettingsJellyfin}` — v2-only
fields (`monitorNewItems`) and v3-only fields (`stashDbApiKey`, `searchOnAddV3`, the
migrate button) are shown conditionally on `apiVersion`.

## 6. Frontend

- Discover: `src/components/Discover/{DiscoverScenes,DiscoverSites,DiscoverPerformers}`, home
  sliders in `Discover/index.tsx`; pages `src/pages/discover/{scenes,sites,performers}.tsx`.
- Details: `SceneDetails/`, `SiteDetails/` (years + library status), `PerformerDetails/`;
  pages `scene/[sceneId]`, `site/[siteId]`, `performer/[performerId]`.
- Requests: `RequestModal/{SceneRequestModal,SiteRequestModal}.tsx` (dispatcher in `index.tsx`),
  `RequestButton/`, `RequestCard/`, `RequestList/RequestItem/`, `StatusBadge/`,
  `hooks/useRequestTitle.ts` (TPDB posters/links for request rows).
- Cards: `TitleCard/` (+ `TpdbTitleCard.tsx`), `MediaSlider/`, `PersonCard/` (performers only).
- Generic: `Common/*`, `Layout/`, `Settings/**`, `Login`, `Setup`, `UserList`, `UserProfile`.

## 7. Commands

```
pnpm dev                 # http://localhost:5055
pnpm typecheck / lint / test / build
pnpm i18n:extract        # regenerates src/i18n/locale/en.json
pnpm migration:generate  # sqlite only
```

pnpm enforced; Node ^22.19. Conventional commits (commitlint + husky; lint-staged runs
prettier + eslint on commit). Live-test credentials live in `.env` (gitignored).
