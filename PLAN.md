# PLAN.md — Whisparr-Seerr transformation

Transform this Seerr fork into a discovery/request app exclusively for **Whisparr v2**
(Sonarr fork: sites = series, scenes = episodes), with **Jellyfin** (kept) and **Stash**
(new) as independent availability libraries. Branch: `whisparr`. Reference map: `CLAUDE.md`.

---

## 0. Key decisions (require sign-off at checkpoint 1)

### D1 — Metadata provider: TPDB, not StashDB (recommendation)

**Finding — VERIFIED in A1 (2026-09-11) against a real v2 `/api/v3/series` payload
(`.context/`, gitignored):** Whisparr v2 stores the **TPDB site id in the repurposed
`tvdbId` field** — the sampled series' `tvdbId` resolves via TPDB `/sites/{id}` to the
exact same site (name and network string match). `imdbId`/`tvMazeId`/`tvRageId` are
absent or null; `titleSlug` is the only other identifier. **No StashDB ids anywhere.**
Additional A1 payload facts: `seasons[].seasonNumber` = calendar years (D2 confirmed);
**no `languageProfileId` field exists in v2** (C1: drop language-profile support);
`seriesType`, `monitorNewItems`, `useSceneNumbering` present → Sonarr-v4-shaped.
Per-episode TPDB scene-id location still unverified (needs `/episode` — live access,
phase C).

The stated preference was StashDB because Stash shares its ids. But the request path —
the part that must never mis-match — runs entirely on TPDB ids: `series/lookup`,
`POST /series` with tvdbId(=TPDB site id), episode monitoring. Two options:

| | **Option 1: TPDB primary (recommended)** | Option 2: StashDB primary + bridge |
|---|---|---|
| Request → Whisparr | Native. Site id from metadata = id Whisparr wants. Zero mapping. | Every request needs StashDB studio → TPDB site resolution (URL/name fuzzy match). Fragile at the most critical point. |
| Discover/search/details | TPDB API: `/scenes`, `/sites`, `/performers` with search, sort, pagination, posters. Covers DoD 2–4. | StashDB GraphQL is richer for performers. |
| Stash availability | Via `stash_id` fields TPDB exposes on scenes/performers (verify in A1) + path matching fallback. | Native id match. |
| API key | TPDB key (free account). | StashDB key + TPDB key anyway (bridge). |

**Recommendation: Option 1.** One provider, no bridge on the request path. Stash matching
gets a two-tier strategy (D3) that works regardless. If A1's live verification shows TPDB's
stash_id coverage is too thin for Stash matching, escalate before phase C.

### D2 — Season/SeasonRequest mapping: keep, seasons = years

Whisparr v2 organizes a site's scenes into year-based seasons (Sonarr's season model,
season number = year). Mapping:

- **Site request** = today's series request: `MediaRequest(type='site')` +
  `SeasonRequest` rows keyed on year. Request all years or specific years — the existing
  season-picker UX carries over nearly unchanged.
- **Scene request** (new granularity, DoD 5) = `MediaRequest(type='scene')` with the TPDB
  scene id: dispatch adds the site unmonitored (if absent), then monitors exactly that
  one episode + optional search. Uses Whisparr's `/episode` + `/episode/monitor`, same
  endpoints the existing Sonarr code already wraps.
- `Season` entity (library state per year) stays as-is mechanically.

Rationale: deleting the season model would mean rebuilding partial-availability tracking
from scratch; reusing it is the smaller change and matches Whisparr's actual data shape.

### D3 — Availability matching (Stash & Jellyfin)

An item is AVAILABLE if **any** enabled library has it (DoD 6).

- **Stash, tier 1 — path match (primary):** Whisparr knows the episode file path; Stash
  indexes the same filesystem. Normalize + compare paths (configurable path-mapping
  prefix table in Stash settings, since mount points differ between containers).
  *A1 partial finding (2026-09-11): TPDB scene payloads carry **no** StashDB ids —
  `links` and `hashes` empty across the sampled list and detail responses — so an
  id-bridge via TPDB is off the table.*
- **Stash, tier 2 — TPDB-endpoint stash_ids (bonus, verify in C2):** Stash's `stash_ids`
  support multiple endpoints; if this Stash instance scrapes with the TPDB scraper, its
  scenes carry TPDB ids that match directly. Checked against the live Stash in C2; if
  absent, tier 1 alone decides.
  *C live check (2026-09-12): Stash v0.31.1 has ThePornDB configured as a stash-box
  (`endpoint: https://theporndb.net/graphql`), but the library holds 0 scenes and no
  scene scrapers. Tier 2 stays viable (stash_id = TPDB uuid `id` under that endpoint)
  but is unverifiable on data until the library is populated; tier 1 leads.*
- **Jellyfin — path match only:** same normalized-path comparison against Jellyfin item
  `Path`. **Limits (documented per assignment):** only works for files Whisparr placed or
  that live under the same roots; scenes that entered Jellyfin outside Whisparr and with
  different paths are invisible. No title-guessing heuristics — a miss shows as
  "not available in Jellyfin", never a wrong match.

### D4 — Interpretation of "no external calls"

Removed: TMDB (incl. hardcoded API key), Rotten Tomatoes/IMDb ratings proxy, GitHub
update check, plex.tv, Tautulli, animelist. Kept: user-configured notification agents
(Discord/Telegram/email/…) — they are deliberate outbound integrations, not telemetry.
**Assumption flagged for sign-off.** All provider images route through the existing
image proxy, generalized from `/imageproxy/tmdb/` to `/imageproxy/<provider>/`.

### D5 — Silent-delete removal

`sendToSonarr`'s "no tvdbId → delete media + request rows" is replaced by: request →
`FAILED` with a stored, human-readable reason (new `failureReason` column on
MediaRequest), surfaced in the request list UI. No entity deletion on dispatch errors.

---

## 1. What stays / goes / is new

**Stays (adapted):** Express+Next single process, TypeORM+SQLite, session auth, local +
Jellyfin login, permission bitfield, request/approval workflow, subscriber-based
dispatch, notification agents, image proxy, settings.json system, job scheduler,
Seerr UI component structure and look.

**Goes:** TMDB/TVDB clients & routes, Radarr/Sonarr clients & scanners & settings,
Plex (auth, scanner, plextv, watchlist sync), Emby paths (`MediaServerType.EMBY`),
Tautulli, ratings proxies, animelist/anime keyword logic, 4K everywhere (`status4k`,
`is4k`, `*4k` columns/settings/UI), Postgres (`server/migration/postgres/`, `isPgsql`,
pg deps), discover-slider TMDB content, movie/tv component pairs, GitHub update check.

**New:** TPDB client + models, Whisparr client (from `sonarr.ts`), Stash GraphQL client,
scene/site/performer routes + pages, Stash settings + scanner, `failureReason`,
`searchOnRequest` setting (default OFF), Docker compose on port 5056.

---

## 2. Phases and tasks

Task ids are stable for delegation. Every subagent brief includes: goal, CLAUDE.md
sections, allowed files, acceptance criteria, "run `pnpm typecheck` + relevant tests
before reporting". No two parallel tasks share files. After each phase: typecheck,
lint, tests, build; update PROGRESS.md; commit.

### Phase A — Metadata provider + image proxy

| Task | Description | Files (owned) | Depends |
|---|---|---|---|
| A1 | **Live verification** (needs `WHISPARR_API_KEY`): dump one series + episodes from 192.168.6.2:6969; confirm tvdbId=TPDB site id, season=year, scene id location; probe TPDB API for `stash_id` coverage on scenes. Findings appended to PLAN.md §0. | none (read-only probe) | .env |
| A2 | TPDB client: `server/api/tpdb/{index,interfaces}.ts` extending `ExternalAPI` (auth header from settings, cache id `tpdb`, rate limit). Search/details/discover for scenes, sites, performers. | `server/api/tpdb/*`, `server/lib/cache.ts` | A1 |
| A3 | Models: `server/models/{Scene,Site,Performer}.ts` + mappers (replacing Movie/Tv/Search shape for the new types). | `server/models/*` (new files only) | A2 |
| A4 | Image proxy generalization: `/imageproxy/tpdb/*` (+ keep avatar path), remove tmdb/tvdb proxy targets; `CachedImage` rewrite rule. | `server/routes/imageproxy.ts`, `server/lib/imageproxy.ts`, `src/components/Common/CachedImage/*` | A2 |
| A5 | Settings: `metadata` section (provider + API key, from settings.json / env), TMDB key removal from `themoviedb/index.ts` is deferred to F (file dies there). | `server/lib/settings/index.ts` (metadata block only) | — |

> **Reference-repo findings folded in (seerrng-reference, explored 2026-09-11):**
> (1) B2: the unique index on the new foreign-id column goes in the **same migration**
> that creates it (reference retrofitted theirs months later — avoid). Clean shape:
> unique `(tpdbId, mediaType)`. (2) Performers stay browse-only with no Media row,
> mirroring their artist model. (3) D3t adds a `serverId: 0` falsy-vs-unset regression
> test (bug they shipped). (4) F2: the mediaType enum is duplicated at 10+ spots in
> `seerr-api.yml` — sweep by grep, not memory. (5) Their per-backend OverrideRule
> columns don't scale; we have one backend, so `whisparrServiceId` replaces the two
> existing columns rather than joining them.

### Phase B — Data model

| Task | Description | Files | Depends |
|---|---|---|---|
> **Strategy adjustment (post-A, 2026-09-11): phase B is additive.** Replacing
> MOVIE/TV in place would force half the transformation into one phase (every enum
> consumer breaks; per-phase gates couldn't stay green). Instead B *adds* SCENE/SITE
> and new columns; movie/tv/4K removal stays in phase F as planned. End state
> identical, every intermediate tree compiles — same approach the reference fork used.

| B1 | Add `SCENE='scene'`, `SITE='site'` to `MediaType` (keep MOVIE/TV until F); add `Media.tpdbId` (**varchar** nullable — site ids are numeric, scene ids uuid-shaped, opaque text key covers both) with partial unique index in the SAME migration; add `MediaRequest.failureReason` (varchar nullable, D5) and `MediaRequest.sentToServiceAt` (datetime nullable, idempotency guard for D2t); keep Season/SeasonRequest (D2). Hand-written SQLite migration included. | `server/constants/media.ts`, `server/entity/{Media,MediaRequest}.ts`, `server/migration/sqlite/*` (new file) | — |
| B2 | Remove Postgres: delete `server/migration/postgres/`, `isPgsql` + pg config branches in datasource, `pg` dep, `compose.postgres.yaml`; simplify `DbColumnHelper`/`dbType` internals to sqlite-only (public API unchanged so entities don't churn). | `server/datasource.ts`, `server/utils/{dbType,DbColumnHelper}.ts`, `server/migration/postgres/` (delete), `package.json`, `compose.postgres.yaml` | — (parallel with B1) |
| ~~B3~~ | Folded into F (fallout only exists once old types are removed). | — | — |

### Phase C — Services (Whisparr, Stash, Jellyfin adapt) + settings UI

| Task | Description | Files | Depends |
|---|---|---|---|
| C1 | Whisparr client: copy `server/api/servarr/sonarr.ts` → `whisparr.ts`; rename types (SonarrSeries→WhisparrSite etc.), keep ServarrBase; add `monitorEpisodes`-based single-scene add (D2). Delete radarr.ts/sonarr.ts usage comes in F. | `server/api/servarr/whisparr.ts` | A1 |
| C2 | Stash GraphQL client: `server/api/stash/index.ts` (findScenes by stash_id/path, systemStatus for test). API-key header. | `server/api/stash/*` | — |
| C3 | Settings backend: `WhisparrSettings` (single server: url, apiKey, rootFolder, profile, `searchOnRequest` default false), `StashSettings` (url, apiKey, enabled, pathMappings), keep JellyfinSettings + add `enabled` flag. Routes `settings/whisparr.ts`, `settings/stash.ts` (CRUD+test), spec entries in `seerr-api.yml`. | `server/lib/settings/index.ts`, `server/routes/settings/*`, `seerr-api.yml` | C1,C2 |
| C4 | Jellyfin scanner adapt: availability by path match (D3), write to scene/site Media rows; remove Emby branches. Keep Jellyfin auth untouched. | `server/lib/scanners/jellyfin/*`, `server/lib/scanners/baseScanner.ts` | B*, C2 |
| C5 | Whisparr scanner (from sonarr scanner): sync site/scene status into Media/Season; Stash sync job (id+path match per D3). Jobs registered in `job/schedule.ts`. | `server/lib/scanners/whisparr/*`, `server/lib/scanners/stash/*`, `server/job/schedule.ts` | C1,C2,C4 |
| C6 | Settings UI: `WhisparrModal` + `StashSettings` page section + Jellyfin enable toggle; wire into `SettingsServices.tsx` / settings pages; remove Radarr/Sonarr/Plex/Tautulli settings UI. | `src/components/Settings/**`, `src/pages/settings/*` | C3 |

### Phase D — Request flow end-to-end

| Task | Description | Files | Depends |
|---|---|---|---|
| D1t | `MediaRequest.createRequest`: TPDB validation instead of TMDB, scene+site branches (D2), quota per type, no 4K/anime paths. | `server/entity/MediaRequest.ts` | B*, A2 |
| D2t | Subscriber: `sendToWhisparr` replacing sendToSonarr/Radarr. **Idempotent**: dispatch guard column (`sentToServiceAt` timestamp checked-and-set inside the request lock) so APPROVED transitions send exactly once; **no fire-and-forget** — awaited, failures → `FAILED` + `failureReason` (D5). `searchOnRequest` respected. | `server/subscriber/MediaRequestSubscriber.ts` | D1t, C1 |
| D3t | Tests: unit tests for idempotency (double-approve, concurrent save, retry-after-FAILED) and for no-delete-on-missing-id. Extend existing `server/routes/request.test.ts` patterns. | `server/**/**.test.ts` (new files) | D2t |
| D4t | Status sync: availability aggregation (Whisparr has-file → PROCESSING/AVAILABLE per D3 libraries), request COMPLETED propagation. | `server/lib/availabilitySync.ts`, `server/lib/downloadtracker.ts` | C5, D2t |

### Phase E — Frontend

| Task | Description | Files | Depends |
|---|---|---|---|
| E1 | Discover: recent scenes, popular sites, performers sliders + pagination pages (collapse `Discover/{Movie*,Tv*}` pairs into `Discover/{Scenes,Sites,Performers}`). | `src/components/Discover/**`, `src/pages/discover/**`, `server/routes/discover.ts` | A2,A3 |
| E2 | Search across scenes/sites/performers: `server/routes/search.ts` → TPDB, frontend `Search` unchanged shape. | `server/routes/search.ts`, `server/lib/search.ts`, `src/components/Search/*` | A2,A3 |
| E3 | Detail pages: `SceneDetails`, `SiteDetails` (from TvDetails+Season), `PerformerDetails` (from PersonDetails). Whisparr/file/Stash/Jellyfin availability badges + "Play in Stash/Jellyfin" links. | `src/components/{Scene,Site,Performer}Details/**`, `src/pages/{scene,site,performer}/**`, `server/routes/{scene,site,performer}.ts` | D4t |
| E4 | Request modal: collapse Movie/Tv modals into Scene/Site modals (site keeps year/season picker); RequestButton/Card/List/StatusBadge/ManageSlideOver updated for new types. | `src/components/Request*/**`, `src/components/{StatusBadge,ManageSlideOver,DownloadBlock}/**` | E3 |
| E5 | Shell: sidebar links, TitleCard/TmdbTitleCard → TpdbTitleCard, MediaSlider types, remove watchlist/blocklist-TMDB paths or adapt blocklist to tpdb ids (keep blocklist — small adapt). | `src/components/{Layout,TitleCard,MediaSlider}/**` | E1–E4 |

### Phase F — Removal sweep

| Task | Description | Files | Depends |
|---|---|---|---|
| F1 | Delete: `server/api/{themoviedb,tvdb,plexapi,plextv,tautulli,animelist,ratings*,rating}/`, radarr/sonarr clients+scanners+routes, `server/models/{Movie,Tv}.ts`, movie/tv routes, Plex auth routes+UI, watchlist sync. Grep-verified: no `tmdb|radarr|sonarr|plex|emby|tautulli|anime` identifiers left outside i18n history. | ownership: whole-repo delete pass, single agent | E* |
| F2 | `seerr-api.yml` purge + rebuild of removed paths; en.json re-extract; dead i18n keys dropped. | `seerr-api.yml`, `src/i18n/**` | F1 |

### Phase G — Privacy, Docker, docs

| Task | Description | Files | Depends |
|---|---|---|---|
| G1 | Telemetry sweep per D4: GitHub update check + VersionStatus UI, scarf, any残 external fetches. | `server/api/github.ts` (delete), `src/components/Layout/VersionStatus/*`, `server/routes/settings/index.ts` about-block | F1 |
| G2 | Docker: Dockerfile check (no pg), `docker-compose.yml` example port 5056 + config volume; `.env` in `.gitignore`. | `Dockerfile`, `docker-compose.yml`, `.gitignore` | F* |
| G3 | README rewrite: setup, env vars, Stash-only/Jellyfin-only/both, fresh-DB note. PROGRESS.md final. | `README.md`, `PROGRESS.md` | G2 |

**Phase order note vs. the suggested order:** identical except settings UI (C6) folded
into phase C so the live Whisparr connection is testable before the request flow lands.

---

## 3. Risks

1. ~~TPDB `stash_id` coverage unknown~~ **Resolved in A1 (partial):** coverage is zero —
   TPDB exposes no StashDB ids. Stash matching runs on path matching (D3 tier 1), with
   TPDB-endpoint `stash_ids` in the live Stash instance as a possible bonus tier (C2).
   API shapes confirmed workable for A2: Laravel-style pagination meta, scene
   `poster`/`background`/`site_id`, site `network`/`parent`, performer `bio`/`image`.
2. **Whisparr v2 API drift from Sonarr v3** (it's a fork, not a mirror) → A1 dumps real
   payloads before C1 copies code; `languageProfile` likely absent, remove.
3. **Scene-level requests are new territory** (Seerr never requested single episodes) →
   isolated in D1t/D2t behind `type='scene'`; site requests keep the proven path.
4. **Fresh-database fork**: no data migration from an existing Seerr install. Accepted
   (private single-owner instance); stated in README.
5. **Test surface**: existing tests reference movies/TMDB heavily; test rewrite rides
   along with each phase rather than a big-bang fix in F.
6. **i18n**: only `en.json` maintained; other locales keep stale strings until re-extract
   (harmless — fallback is English).

## 4. Needed from you (checkpoint 1)

1. **Approve/adjust decisions D1–D5** (esp. D1 provider choice and D4 notification
   interpretation).
2. **`.env` status:** exists, gitignored, `TPDB_API_KEY` present and verified working
   against api.theporndb.net. Still needed:
   ```
   WHISPARR_API_KEY=<from Whisparr: Settings > General > Security>   ← blocks A1's Whisparr half + phase C
   STASH_URL=<url — needed from phase C2>
   STASH_API_KEY=<needed from phase C2>
   ```
   (`WHISPARR_URL` defaults to http://192.168.6.2:6969 unless told otherwise.)
3. **`../seerrng-reference` does not exist on disk** (`C:/Users/Dylan/dev/` contains only
   this repo). Place it there or point me to it; until then the plan relies on CLAUDE.md
   and live API verification instead.
