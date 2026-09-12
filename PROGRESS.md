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
- **Next: C4/C5 scanners.** Whisparr test instance holds 1 site
  (Brazzers, tvdbId 92, 277 episodes, 0 files) — pre-existing, not ours.

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

- C4 Jellyfin scanner adapt, C5 Whisparr + Stash scanners (unblocked)
- Live connection tests of C3/C6 settings pages against real instances

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

- None. (No live Whisparr access yet; nothing to clean up.)
