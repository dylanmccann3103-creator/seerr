# CLAUDE.md — codebase map (Seerr for Whisparr)

Fork of Seerr turned into a request manager for Whisparr v2. Next.js frontend (`src/`)
+ Express/TypeORM backend (`server/`), one process. Path aliases: `@server/*` → `server/`,
`@app/*` → `src/`. **SQLite only.** No TMDB/Radarr/Sonarr/Plex code remains; do not
re-introduce any. Outbound traffic is limited to ThePornDB, Whisparr, Stash, Jellyfin and
user-configured notification agents (no GitHub update check, no telemetry).

## 1. External services

| File | Role |
|---|---|
| `server/api/externalapi.ts` | Base HTTP class (axios, proxy, rate limit, cache). Everything below extends it. |
| `server/api/tpdb/` | ThePornDB client: scenes, sites, performers, search. Key = `settings.tpdb.apiKey` or `TPDB_API_KEY`. Cache id `tpdb`. |
| `server/api/servarr/whisparr.ts` | Whisparr v2 client (Sonarr v3 shape). `tvdbId` on a series **is the TPDB site id**; `tvdbId` on an episode is the TPDB scene `_id`; seasons are calendar years; lookup prefix is `tpdb:<id>`. Cache id `whisparr`. |
| `server/api/servarr/base.ts` | Shared Servarr surface (`buildUrl`, profiles, root folders, tags, commands). |
| `server/api/stash/` | Stash GraphQL client (`findSceneByPath`). |
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

One job, `whisparr-scan` (`server/lib/scanners/whisparr/`), is the single writer for
SITE/SCENE media: sites → SITE rows + year seasons, file-bearing episodes → SCENE rows
(`tpdbId` = episode `tvdbId`, `tmdbId = 0` placeholder, `externalServiceId` = episode id).
`server/lib/scanners/library.ts` maps Whisparr file paths through per-library path mappings
and asks Stash and/or Jellyfin; a title is AVAILABLE only when a library has the file.
Vanished media → DELETED; orphaned approved requests → DECLINED.

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
profile, root folder, `monitorNewItems`, `searchOnRequest` default **false**, `tagRequests`),
`stash` (`url`, `apiKey`, `pathMappings`), `jellyfin` (+ `pathMappings`), `tpdb.apiKey`,
`main` (no `versionCheck`, no 4K flags). Routes: `server/routes/settings/{whisparr,stash}.ts`.
UI: `src/components/Settings/{SettingsWhisparr,SettingsStash,SettingsJellyfin}`.

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
