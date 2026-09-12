# PROGRESS.md

## In progress (phase C)

- **C1 done, reviewed & accepted** — WhisparrAPI (commit `580e2ec6`): sonarr
  port, calendar-year seasons, no language profiles (asserted in tests),
  episode↔TPDB-scene-id field left TODO pending live access. 18 tests.
- **C2 done, reviewed & accepted** — StashAPI GraphQL client (same commit),
  filter shapes verified against public stashapp schema. 9 tests.
- **C3 done, reviewed & accepted** (`9b55c870`) — settings backend + routes
  + OpenAPI entries; searchOnRequest default OFF (ponytail-commented).
- **C6 done, reviewed & accepted** (`a4686a2e`) — SettingsWhisparr on the
  services page, Stash tab + path-mapping editor, 57 i18n keys.
- **Blocker lifted 2026-09-12** — .env complete (WHISPARR_API_KEY,
  STASH_URL=http://192.168.6.2:30198, STASH_API_KEY). Live: Whisparr
  2.2.0.231 OK, Stash v0.31.1 OK.
- **Episode↔TPDB id VERIFIED**: Whisparr `/episode` carries `tvdbId` =
  TPDB scene numeric `_id` (5241456 ↔ "Brazzers Live 1: The Beginning",
  cross-checked on `/scenes/5241456`). Episodes use `releaseDate`, not
  airDate; `actors[].tpdbId` present. Phase D scene dispatch unblocked.
- **Stash tier-2**: ThePornDB is configured as stash-box endpoint, but
  library is empty (0 scenes, only builtin_autotag scraper). Tier 1 path
  match leads; tier 2 verifiable once scenes exist.
- **C4+C5 done** — one `whisparr-scan` job (`server/lib/scanners/whisparr/`)
  is the single writer for SITE/SCENE media: sites → SITE rows + year
  seasons (monitored/no file → PROCESSING), file-bearing episodes → SCENE
  rows (tpdbId = Whisparr episode `tvdbId`, `tmdbId = 0` placeholder,
  `externalServiceId` = episode id), orphan cleanup + request decline.
  Availability is library-driven (D3): `server/lib/scanners/library.ts`
  maps Whisparr file paths through per-library prefix tables and asks
  Stash (`findSceneByPath`) / Jellyfin (preloaded `getLibraryPaths`) —
  AVAILABLE only when a library has the file. 4 tests. Live-run against
  Whisparr+Stash: Brazzers → PROCESSING, 11 year-seasons, 0 scenes (no
  files yet).
  Deviations from PLAN: (1) no separate Stash job and no rewrite of the
  old Jellyfin scanner — both libraries are lookups inside the Whisparr
  scan (only Whisparr can map path→scene id); old jellyfin/sonarr scanners
  + jobs stay until F1. (2) `JellyfinSettings.pathMappings` added backend-
  only (default `[]`), needs a C6-style editor in the Jellyfin settings UI.
  (3) Stash tier-2 (stash_id) not wired: Whisparr only exposes numeric
  `_id`, no uuid. Unverified: `episodeFile.path` shape (Sonarr v3 assumed,
  test instance has no files).
- Whisparr test instance holds 1 site (Brazzers, tvdbId 92, 277 episodes,
  0 files) — pre-existing, not ours.

## Done (phase E)

- **Backend for E1–E3 done** (`acbd56cf`): `/discover/{scenes,sites,performers}`,
  TPDB search (sites + performers ride along on page 1, scenes paginate; no
  prefix providers), `/scene/:id`, `/site/:id` (+ Whisparr year seasons,
  `/site/:id/scenes`), `/performer/:id` (+ `/scenes` via `performer_id`),
  `Media.getRelatedTpdbMedia`, OpenAPI entries. Live-verified through the
  router with the request validator. Scene performer refs now use the
  parent performer id (site-performer ids don't resolve on `/performers`).
- **Shared cards done** (`73f9c924`): TitleCard/MediaSlider/ListView render
  scene/site/performer; PersonCard `type="performer"`. Watchlist/blocklist
  buttons hidden for TPDB cards (both are TMDB-keyed; E5 "small adapt"
  deferred — decide in F whether blocklist survives at all).
- **E1/E2/E5 done** — home sliders Recent Scenes / Sites / Performers
  (`DiscoverSliderType` appended, bootstrapped at startup for existing
  installs), discover pages `/discover/{scenes,sites,performers}` (no
  filters: TPDB has none), sidebar + mobile menu links, search typed to TPDB
  results, `useDiscover` hide-* filters cover scene/site.
- **E3 done** — `SceneDetails`, `SiteDetails` (years with library status +
  site scenes grid), `PerformerDetails` (bio, aliases, scenes grid) + pages.
  Play button only when `mediaInfo.mediaUrl` exists (Jellyfin); no Stash
  deep link yet (no Stash scene id is stored — see C5 note).
- **E4 done** — `SceneRequestModal` / `SiteRequestModal` (year picker,
  pre-checked/disabled years from library + active requests), dispatcher,
  `RequestButton`, `StatusBadge` ("Manage Scene/Site", "Open in Whisparr"),
  `useRequestTitle` hook feeding RequestCard/RequestItem (TPDB posters,
  `/scene|/site/<tpdbId>` links, "Years" label, `failureReason` shown in
  red on FAILED). Edit mode on pending scene/site requests = approve/cancel
  only (PUT /request/:id has no scene/site branch — F/G follow-up).
  `ManageSlideOver` untouched (movie/tv-only callers, deleted in F).
- `en.json` regenerated via `i18n:extract`. Gate: typecheck server+client,
  lint, tests, `next build`.

## Done (phase D)

- **D1t** — `MediaRequest.createWhisparrRequest`: scene (movie-shaped, one
  item) and site (year seasons) branches, TPDB validation via
  `getScene`/`getSite`, `Permission.REQUEST` + `AUTO_APPROVE`/`MANAGE_REQUESTS`
  auto-approve, quotas reuse movie (scene) / tv (site years) columns
  (ponytail-commented). `seasons: 'all'` for a site resolves years from
  Whisparr's lookup. Override rules skipped for scene/site (TMDB-keyed).
- **D2t** — `MediaRequestSubscriber.sendToWhisparr`: awaited, exactly-once
  via an atomic conditional UPDATE on `sentToServiceAt` (no in-process lock:
  subscribers hold the save connection, see `utils/requestLock.ts`).
  Failure → FAILED + `failureReason`, guard cleared so `/retry` resends.
  Nothing deleted (D5). Scene dispatch = addSite (no seasons) → poll
  `/episode` for the TPDB `_id` → `/episode/monitor` (+ `EpisodeSearch`
  when `searchOnRequest`). Bookkeeping writes use `callListeners(false)`.
- **D3t** — 7 tests in `MediaRequestSubscriber.whisparr.test.ts`: scene
  dispatch, site 'all' years, double+concurrent approve → 1 send,
  FAILED+reason+retry, missing episode → FAILED (rows kept), COMPLETED
  propagation for scene and site, duplicate/no-years rejections.
- **D4t** — COMPLETED propagation generalized (`isSeasonal`/`isSingleItem`
  helpers in `constants/media.ts`) in MediaSubscriber + updateParentStatus
  + remove handler; download tracker polls the Whisparr queue
  (`Media.downloadStatus` for site by series id, scene by episode id);
  Whisparr scan now sets vanished AVAILABLE/PARTIAL media to DELETED.
- **Live-verified** against the real Whisparr: scene request for 5241456 →
  APPROVED, media PROCESSING, externalServiceId = episode 1, 287 ms.
  Found + fixed: Whisparr v2 lookup prefix is `tpdb:<id>` (Sonarr's `tvdb:`
  returns `[]`); a non-library site's lookup does include year seasons.
- Notifications for scene/site go through TPDB (`sendNotification` branch).

## Done

- **Plan** — PLAN.md written, D1–D5 approved (checkpoint 1 passed 2026-09-11).
- **A1 — ID verification**: real Whisparr v2 `/api/v3/series` payload analyzed
  (`.context/`, gitignored). Confirmed: `tvdbId` field carries TPDB site ids
  (cross-checked against TPDB `/sites/{id}`: name + network match exactly);
  seasons = calendar years; no `languageProfileId` in v2; no StashDB ids anywhere.
  TPDB API probe: auth OK, Laravel-style pagination, **zero** StashDB-id coverage
  → Stash availability matching = path matching (PLAN.md D3 revised accordingly).

## Done (phase B)

- **B1 reviewed & accepted** — SCENE/SITE added to MediaType; `Media.tpdbId`
  (varchar, partial unique index `UQ_media_tpdb_type` in the SAME migration,
  smoke-tested incl. NULL-duplicates-allowed semantics);
  `MediaRequest.failureReason` + `sentToServiceAt`. Migration
  `1789161912799-AddSceneSiteFoundation` uses plain ALTER TABLE (justified +
  documented in-file; sqlite 3.44 supports DROP COLUMN).
- **B2 reviewed & accepted** — Postgres fully removed (19 migrations +
  compose.postgres.yaml deleted — deletion scope verified exact; authorized by
  project constraint "SQLite only"); datasource sqlite-only; `isPgsql`
  hardcoded false + `resolveDbType` passthrough kept alive for the F sweep;
  `pg` dep dropped, lockfile updated.
- **Lead integration** — enum-widening fallout fixed: `BlocklistItem`/
  `WatchlistItem.mediaType` → `` `${MediaType}` `` (nominal-enum-safe);
  default arms in the two request.ts switches (profileName/canRemove for
  scene/site defer to phase D); temporary `as 'movie' | 'tv'` casts at 12
  frontend prop sites — these components are rebuilt in phase E anyway.
- Gate: typecheck server+client clean, 197/197 tests, build green.
- Strategy adjustment recorded in PLAN.md: phase B is additive; movie/tv/4K
  removal stays in phase F so every intermediate tree keeps a green gate.

## Done (phase A)

- **A2+A5 done, reviewed & accepted** — TPDB client (`server/api/tpdb/`),
  settings block, 15 unit tests. Live-verified params: `q=`, `page=`,
  `site_id=`; no server-side sort exists (see open issues). Commit `2c34680f`.
- **A3 done, reviewed & accepted** — Scene/Site/Performer models + mappers,
  proxy-safe images only, defensive caps. Commit `33d20fcf`. Note: TPDB scene
  `id` is uuid-shaped, `_id` numeric → `Media.tpdbId` becomes varchar in B1;
  which id Whisparr v2 uses per episode gets pinned live in phase C.
- **A4 done, reviewed & accepted** — `/imageproxy/tpdb/<cdn|thumb>/...` with a
  two-host allowlist (`cdn.theporndb.net`, `thumb.theporndb.net`); raw TPDB
  `image` fields point at arbitrary studio CDNs and are deliberately NOT
  proxied → mappers (A3) must only expose normalized poster/background/logo/
  thumbnail fields. CachedImage got `type="tpdb"`.
- **Reference exploration done** — findings folded into PLAN.md (phase B note):
  uniqueness index in same migration, performers browse-only, serverId:0
  regression test, OpenAPI enum sweep, single whisparrServiceId on OverrideRule.

## Next

- Phase F (removal sweep: TMDB/Radarr/Sonarr/Plex/movie/tv code)
- Browser walkthrough of the new pages against live TPDB/Whisparr (needs a
  configured dev instance: settings.json + Jellyfin auth)
- Live connection tests of C3/C6 settings pages against real instances
- Jellyfin pathMappings editor in settings UI (C6 follow-up)

## Open issues

- **DoD 2 deviation — "popular sites":** TPDB's public API has no working
  sort/order params (verified live; invalid values silently accepted). Recent
  scenes works (default order = newest first); sites can only be listed in
  default (alphabetical) order. Options: ship "Sites" slider as-is, or derive
  popularity locally from request counts later. Proceeding with default order
  unless directed otherwise.

- ~~Per-episode TPDB scene-id location~~ resolved 2026-09-12 (see phase C).
- ~~Stash instance details~~ resolved; TPDB scraping unverifiable on empty library.

## Test data added to Whisparr

- 2026-09-12 phase D smoke: one scene request (Brazzers episode id 1, TPDB
  5241456) did a PUT /series on the pre-existing Brazzers site (monitored
  stays true, tags unchanged) and a no-op monitor of episode 1 (already
  monitored). No search, no downloads, no new sites. Nothing to clean up.
