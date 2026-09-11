# CLAUDE.md — seerr codebase map

Seerr (Overseerr/Jellyseerr lineage): media request manager. Next.js frontend (`src/`) +
Express/TypeORM backend (`server/`), one process. Path aliases: `@server/*` → `server/`,
`@app/*` → `src/`.

Note: the repo directory is named `seerr-whisparr`, but there is **no Whisparr code in the
tree** — only Sonarr and Radarr. Any Whisparr work is greenfield.

---

## 1. TMDB

### Service layer

| File | Role |
|---|---|
| `server/api/externalapi.ts` | Base HTTP class: axios + params, proxy/user-agent interceptors, optional rate limit, cache-aware `get`/`post`/`getRolling`/`removeCache`. Everything external extends this. |
| `server/api/themoviedb/index.ts` | **The TMDB client.** ~1500 lines, `class TheMovieDb extends ExternalAPI implements TvShowProvider`. Base `https://api.themoviedb.org/3`, hardcoded `api_key`, rate limit 20 req / 50 RPS, cache `tmdb` + separate short-lived `tmdbscan` cache (`SCAN_TTL = 900`). |
| `server/api/themoviedb/interfaces.ts` | Raw `Tmdb*` response types. |
| `server/api/themoviedb/constants.ts` | Only `ANIME_KEYWORD_ID` — used everywhere to decide "is this anime". |
| `server/api/metadata.ts` | `getMetadataProvider(mediaType)`. **Movies are always TMDB.** `tv`/`anime` can be routed to TVDB via `settings.metadataSettings`. Falls back to TMDB on any error. |
| `server/api/provider.ts` | `TvShowProvider` interface — the *only* swappable surface: `getTvShow`, `getTvSeason`, `getShowByTvdbId`. Everything else (search, discover, movies, people, collections, genres, keywords, watch providers) is TMDB-only by construction. |
| `server/api/tvdb/index.ts` | Alternative TV provider; returns TMDB-shaped objects so callers don't branch. |

Method groups on `TheMovieDb`: `searchMulti/searchMovies/searchTvShows`, `getMovie/getTvShow/getTvSeason`,
`getPerson/getPersonCombinedCredits`, `get{Movie,Tv}{Recommendations,Similar}`,
`getDiscoverMovies/getDiscoverTv`, `getUpcomingMovies`, `getAllTrending/getMovieTrending/getTvTrending`,
`getByExternalId`/`getShowByTvdbId`, `getCollection`, `getRegions/getLanguages`,
`getStudio/getNetwork`, `get{Movie,Tv}Genres`, `get{Movie,Tv}Certifications`,
`searchKeyword/searchCompany/getKeywordDetails`, `get{Movie,Tv}WatchProviders`.
The `*ForScan` variants (`getTvShowForScan`, `getByExternalIdForScan`, `resolveImdbIdForScan`,
`getShowByTvdbIdForScan`) exist so library scans don't poison the long-lived detail cache.

### Mapping layer

Raw `Tmdb*` → public API shapes in `server/models/`: `Search.ts` (`mapSearchResults`,
`mapMovieResult`, `mapTvResult`, `mapPersonResult`, `mapCollectionResult`), `Movie.ts`
(`mapMovieDetails`), `Tv.ts` (`mapTvDetails`, `mapSeasonWithEpisodes`), `common.ts`
(cast/crew/videos/external ids/watch providers). Routes never return raw TMDB.

### Where TMDB is consumed

- **Search** — `server/routes/search.ts` + `server/lib/search.ts`. `lib/search.ts` holds
  prefix providers: `tmdb:<id>`, `imdb:tt…`, `tvdb:<id>`, `year:<yyyy>`. No prefix match →
  plain `tmdb.searchMulti`. Results are joined with local DB rows via `Media.getRelatedMedia`.
- **Discover** — `server/routes/discover.ts` (~1000 lines, 15 endpoints): `/movies`,
  `/movies/language/:language`, `/movies/genre/:genreId`, `/movies/studio/:studioId`,
  `/movies/upcoming`, the same five for `/tv` (`network` instead of `studio`), `/trending`,
  `/keyword/:keywordId`, `/genreslider/movie`, `/genreslider/tv`, `/watchlist`.
- **Details** — `server/routes/movie.ts` (TMDB direct), `server/routes/tv.ts` (fetches from
  TMDB first to read keywords, then re-fetches through `getMetadataProvider('anime'|'tv')`),
  `server/routes/person.ts`, `server/routes/collection.ts`.
- **Request creation** — `server/entity/MediaRequest.ts` calls `tmdb.getMovie`/`getTvShow` to
  validate the id, resolve `external_ids.tvdb_id`, and read keywords for anime detection.
- **Sending to *arr** — `server/subscriber/MediaRequestSubscriber.ts` re-fetches the show
  from TMDB for title + tvdbId.
- **Scanners** — `server/lib/scanners/{sonarr,radarr,plex,jellyfin}/` use the `*ForScan`
  methods to map library items back to TMDB ids.

### Posters and images

TMDB returns relative paths (`posterPath`, `backdropPath`). The **frontend** builds the full
URL: `https://image.tmdb.org/t/p/<size>/<path>` — scattered across `src/components/` (Blocklist,
CollectionDetails, Discover/{Network,Studio,MovieGenre,TvGenre}*, StudioSlider, NetworkSlider…).

`src/components/Common/CachedImage/index.tsx` is the choke point: when
`currentSettings.cacheImages` is on it rewrites `https://image.tmdb.org/` → `/imageproxy/tmdb/`
(and `artworks.thetvdb.com` → `/imageproxy/tvdb/`). Server side: `server/routes/imageproxy.ts`
+ `server/lib/imageproxy.ts` (disk cache, sharp, `image-cache-cleanup` job).

---

## 2. Sonarr integration

### Chain: request → service → call

```
POST /api/v1/request                       server/routes/request.ts:303
  └─ MediaRequest.request()                server/entity/MediaRequest.ts:48
       └─ requestLock.dispatch(userId)     server/utils/requestLock.ts   (per-user serialization)
            └─ MediaRequest.createRequest()  :58
                 permissions → quota → tmdb lookup → find/create Media
                 → dedupe existing requests → OverrideRule → build SeasonRequest[]
                 → requestRepository.save()
                      ↓ TypeORM entity subscriber
       MediaRequestSubscriber.afterInsert / afterUpdate    server/subscriber/MediaRequestSubscriber.ts:1062 / :1103
            └─ sendToSonarr(entity, manager)               :483
                 └─ SonarrAPI.addSeries(options)           server/api/servarr/sonarr.ts:193
                      └─ PUT|POST /api/v3/series
```

**Important structural note:** the *arr dispatch lives in a **TypeORM subscriber**
(`server/subscriber/MediaRequestSubscriber.ts`), not in `@AfterUpdate` hooks on the entity
(upstream Overseerr puts it on the entity). The entity keeps only the notification hooks
(`notifyNewRequest`, `notifyApprovedOrDeclined`, `autoapprovalNotification`). Any save of a
`MediaRequest` that lands on `status = APPROVED` triggers a send — approve route, retry route,
auto-approve on insert, watchlist sync.

Approval entry points, all just `save()` a status change:
- `POST /request/:requestId/approve|decline` — `server/routes/request.ts:677`
- `POST /request/:requestId/retry` (FAILED → APPROVED) — `:640`
- auto-approve at creation via `Permission.AUTO_APPROVE*` / `MANAGE_REQUESTS`

### What `sendToSonarr` does (`MediaRequestSubscriber.ts:483`)

Gate: `status === APPROVED && type === TV`. Then:
1. Pick server: default `sonarr` matching `is4k`, overridden by `entity.serverId`.
2. If `media.status/status4k === AVAILABLE` → mark request + seasons `COMPLETED`, stop.
3. `tmdb.getTvShow` → `tvdbId = series.external_ids.tvdb_id ?? media.tvdbId`. No tvdbId →
   **delete the media and request rows** and throw.
4. Anime detection via `ANIME_KEYWORD_ID` → picks `animeSeriesType`, `activeAnimeDirectory`,
   `activeAnimeProfileId`, `activeAnimeLanguageProfileId`, `animeTags`.
5. Per-request overrides win: `rootFolder`, `profileId`, `languageProfileId`, `tags`.
6. If `sonarrSettings.tagRequests`: find/create a Sonarr tag `"<userId>-<sanitized-displayName>"`
   (handles the legacy `"<id> - <name>"` spacing) and append it.
7. Build `AddSeriesOptions` (`seasons` = `entity.seasons.map(s => s.seasonNumber)`,
   `searchNow: !preventSearch`, `monitorNewItems`, `seasonFolder`).
8. **Fire-and-forget** `addSeries(...)`: `.then` writes `externalServiceId`,
   `externalServiceSlug`, `serviceId` onto `Media` (fresh repository, detached from the request
   transaction); `.catch` flips the request to `FAILED`.

### `SonarrAPI` (`server/api/servarr/sonarr.ts`)

`class SonarrAPI extends ServarrBase<{seriesId, episodeId, episode}>`, base URL built by
`SonarrAPI.buildUrl(settings, '/api/v3')`.

`addSeries` is upsert-shaped: `getSeriesByTvdbId` (via `/series/lookup?term=tvdb:<id>`); if the
series already exists → merge tags, `buildSeasonList` marks requested seasons monitored, `PUT
/series`, then re-monitor any unmonitored episodes of those seasons (`getEpisodes` +
`monitorEpisodes`), then optional `searchSeries`. If new → `POST /series` with all seasons
forced unmonitored except the requested ones, and
`addOptions: { ignoreEpisodesWithFiles: true, searchForMissingEpisodes: searchNow }`.

Also: `getSeries`, `getSeriesById`, `getSeriesByTitle`, `getLanguageProfiles`, `searchSeries`
(`MissingEpisodeSearch` command), `removeSeries`, `clearCache`.

`server/api/servarr/base.ts` (`ServarrBase`) provides the shared surface: `buildUrl`,
`getSystemStatus`, `getProfiles`, `getRootFolders`, `getQueue`, `getTags`, `createTag`,
`renameTag`, `runCommand`, `refreshMonitoredDownloads`. `radarr.ts` is the movie twin.

### Other Sonarr consumers

| File | Purpose |
|---|---|
| `server/lib/scanners/sonarr/index.ts` | `sonarr-scan` job: pulls `/series`, maps to `Media`/`Season` status, orphan cleanup (skipped if any server has sync disabled). |
| `server/lib/downloadtracker.ts` | Polls `/queue` → `Media.downloadStatus` via `@AfterLoad`. |
| `server/lib/availabilitySync.ts` | Detects media removed from Sonarr/library. |
| `server/routes/service.ts` | `/service/sonarr`, `/service/sonarr/:id` — profiles/folders/tags for the request UI. |
| `server/routes/settings/sonarr.ts` | Server CRUD + connection test. |
| `server/routes/media.ts` | `removeSeries(tvdbId)` on media delete. |
| `server/entity/Media.ts` | `@AfterLoad setServiceUrl()` builds the deep link into Sonarr. |
| `server/lib/settings/index.ts` | `SonarrSettings extends DVRSettings` — `seriesType`, `animeSeriesType`, `monitorNewItems`, `enableSeasonFolders`, `tagRequests`, `preventSearch`, `syncEnabled`, `is4k`, `isDefault`. |

UI: `src/components/Settings/SonarrModal/` (mirror of `RadarrModal/`), surfaced at
`src/pages/settings/services.tsx`.

---

## 3. Data model

TypeORM. Entities registered in `server/datasource.ts`; subscribers registered there too
(`IssueCommentSubscriber`, `IssueSubscriber`, `MediaRequestSubscriber`, `MediaSubscriber`).

### Core tables

**`Media`** (`server/entity/Media.ts`) — one row per title, keyed by `@Index(['tmdbId','mediaType'])`.
- ids: `tmdbId`, `tvdbId` (unique, nullable), `imdbId`
- **dual status**: `status` and `status4k`, both `MediaStatus`
- per-quality service linkage: `serviceId`/`serviceId4k` (which *arr server),
  `externalServiceId`/`4k` (*arr internal id), `externalServiceSlug`/`4k`,
  `ratingKey`/`4k` (Plex), `jellyfinMediaId`/`4k`
- relations: `requests` (1:N), `seasons` (1:N, eager), `issues`, `watchlists`, `blocklist` (1:1)
- non-persisted, filled by `@AfterLoad`: `serviceUrl`, `mediaUrl`, `iOSPlexUrl`, `tautulliUrl`,
  `downloadStatus`, `hasActiveRequest`
- statics: `getMedia(tmdbId, mediaType)`, `getRelatedMedia(user, items)` — the batch join used
  by every search/discover route.

**`Season`** (`server/entity/Season.ts`) — actual library state per season: `seasonNumber`,
`status`, `status4k`, `media` (ManyToOne, CASCADE).

**`MediaRequest`** (`server/entity/MediaRequest.ts`) — user intent.
- `status` (`MediaRequestStatus`), `type` (`MediaType`), `is4k`, `seasonCount`
- `requestedBy` / `modifiedBy` → `User`; `media` → `Media`
- *arr overrides: `serverId`, `profileId`, `rootFolder`, `languageProfileId`, `tags` (JSON column)
- flags: `isAutoRequest`, `ignoreQuota`
- `seasons` → `SeasonRequest[]` (cascade, eager)

**`SeasonRequest`** — `seasonNumber` + own `status`, ManyToOne `request`.
Note the deliberate split: `Season` = what the library has, `SeasonRequest` = what was asked for.

**`User`** (`server/entity/User.ts`) — `email`, `username`, `password` (bcrypt, `select: false`),
`plexId`/`plexUsername`/`plexToken`, `jellyfinUserId`/`jellyfinUsername`/`jellyfinAuthToken`/
`jellyfinDeviceId`, `userType`, `permissions` (bitfield, see `server/lib/permissions.ts`),
`avatar`/`avatarETag`/`avatarVersion`, quotas `movieQuotaLimit/Days` + `tvQuotaLimit/Days`,
`resetPasswordGuid` + `recoveryLinkExpirationDate`. Methods: `hasPermission`, `passwordMatch`,
`setPassword`, `generatePassword`, `resetPassword`, `getQuota`, `filter` (strips sensitive
fields before serialization).

**`UserSettings`** — 1:1 with `User`, CASCADE. Locale/region/language, `pgpKey`, per-agent
notification credentials (discordIds, pushbullet, pushover, telegram), `watchlistSyncMovies/Tv`,
`notificationTypes` (JSON bitfields).

### Supporting tables

`Watchlist`, `Blocklist` (+`BlocklistedTags` via settings), `Issue` + `IssueComment`,
`DiscoverSlider` (customizable home rows), `OverrideRule` (auto-apply *arr settings by
user/genre/language/keyword), `Session` (connect-typeorm), `UserPushSubscription`.

### Enums (`server/constants/media.ts`)

```
MediaRequestStatus  PENDING=1 APPROVED DECLINED FAILED COMPLETED
MediaType           MOVIE='movie' TV='tv'
MediaStatus         UNKNOWN=1 PENDING PROCESSING PARTIALLY_AVAILABLE AVAILABLE BLOCKLISTED DELETED
```

### Status propagation

`MediaSubscriber` (Media → requests) and `MediaRequestSubscriber.updateParentStatus` /
`handleRemoveParentUpdate` (requests → Media/Season) keep the two directions in sync — including
resetting stale `PENDING`/`PROCESSING` seasons on request removal so a re-request doesn't fail
with "No seasons available to request".

### Migrations

**Two parallel directories**, picked by `isPgsql` (`server/utils/dbType.ts`):
- `server/migration/sqlite/` — ~54 files, full history back to Overseerr
- `server/migration/postgres/` — ~19 files, starts at `1734786061496-InitialMigration`

A schema change needs **both**. Generate with `pnpm migration:generate`.

Runtime behaviour (`server/datasource.ts` + `server/index.ts:74`):
- dev sqlite: `synchronize: true`, migrations not run
- dev postgres: `migrationsRun: true`
- production (either): `synchronize: false`, `runMigrations()` called explicitly at startup —
  wrapped in `PRAGMA foreign_keys=OFF/ON` for sqlite
- test: in-memory sqlite, `synchronize: true`, `dropSchema: true`

`server/lib/settings/migrations/` is a *separate* mechanism — versioned transforms of
`settings.json`, run by `server/lib/settings/migrator.ts`. Don't confuse the two.

---

## 4. Frontend: movie/tv-specific vs generic

### Generic (no media-type knowledge)

- `src/components/Common/*` — Button, Modal, SlideOver, Table, ListView, CachedImage,
  LoadingSpinner, Tooltip, Badge, Header, PageTitle, … pure presentational.
- `src/components/Layout/`, `Toast`, `LoadingBar`, `PWAHeader`, `ServiceWorkerSetup`
- `src/components/Settings/**` — except `SonarrModal` / `RadarrModal`
- `src/components/Login`, `Setup`, `ResetPassword`, `UserList`, `UserProfile`, `PermissionEdit`
- `src/hooks/*` except `useDiscover` / `useRequestOverride`
- `src/components/Slider`, `GenreCard`, `PersonCard`, `CompanyCard`, tag components

### Polymorphic — one component, branches internally on `mediaType`

These are the files to touch when adding a third media type:

| Component | Branch |
|---|---|
| `TitleCard/index.tsx` | takes `mediaType: MediaType`, builds `/movie/<id>` vs `/tv/<id>` links |
| `TitleCard/TmdbTitleCard.tsx` | picks `/api/v1/movie/:id` vs `/api/v1/tv/:id`, then maps `title`/`name` + `releaseDate`/`firstAirDate` |
| `TitleCard/ErrorCard.tsx` | same split |
| `MediaSlider/index.tsx` | `switch (title.mediaType)` → movie / tv / person card |
| `RequestModal/index.tsx` | dispatcher → `MovieRequestModal` \| `TvRequestModal` \| `CollectionRequestModal` |
| `RequestModal/AdvancedRequester/` | Radarr vs Sonarr servers, language profiles only for TV |
| `RequestModal/QuotaDisplay/` | movie vs tv quota |
| `RequestButton/`, `RequestCard/`, `RequestList/RequestItem/` | type-dependent labels, links, season display |
| `StatusBadge/`, `ManageSlideOver/`, `ExternalLinkBlock/` | tvdb/imdb links, season-level status |
| `IssueModal/CreateIssueModal/`, `IssueDetails/`, `IssueList/IssueItem/` | season/episode fields only for TV |
| `Blocklist/`, `PersonDetails/`, `Selector/`, `QuotaSelector/` | type-aware |
| `Discover/FilterSlideover/` | different TMDB filter sets per type |
| `hooks/useDiscover.ts`, `hooks/useRequestOverride.ts` | type-parameterized |

### Strictly movie-specific

`src/components/MovieDetails/` (`index`, `MovieCast`, `MovieCrew`, `MovieRecommendations`,
`MovieSimilar`), `RequestModal/MovieRequestModal.tsx`,
`Discover/{DiscoverMovies,DiscoverMovieGenre,DiscoverMovieKeyword,DiscoverMovieLanguage,MovieGenreList,MovieGenreSlider,DiscoverStudio,StudioSlider,Upcoming}`,
`CollectionDetails/`, `Settings/RadarrModal/`,
pages under `src/pages/movie/**` and `src/pages/discover/movies/**`.

### Strictly TV-specific

`src/components/TvDetails/` (`index`, `Season`, `TvCast`, `TvCrew`, `TvRecommendations`,
`TvSimilar`), `RequestModal/TvRequestModal.tsx`,
`Discover/{DiscoverTv,DiscoverTvGenre,DiscoverTvKeyword,DiscoverTvLanguage,DiscoverTvUpcoming,TvGenreList,TvGenreSlider,DiscoverNetwork,NetworkSlider}`,
`AirDateBadge/`, `Settings/SonarrModal/`,
pages under `src/pages/tv/**` and `src/pages/discover/tv/**`.

The movie/tv split is **near-perfectly mirrored** — components, discover routes, API routes and
pages all come in pairs. Adding a media type means replicating that pair, plus editing every
polymorphic component in the table above.

---

## 5. Commands

```
pnpm dev                 # nodemon + ts-node, server/index.ts (serves Next too)
pnpm build               # build:next && build:server
pnpm lint / lintfix
pnpm typecheck           # server + client
pnpm test                # node server/test/index.mts
pnpm migration:generate  # against server/datasource.ts — run for BOTH sqlite and postgres
pnpm format
```

Package manager is pnpm (enforced via `only-allow`). Node `^22.19.0`.
Commits follow conventional-commits (commitlint + husky).
