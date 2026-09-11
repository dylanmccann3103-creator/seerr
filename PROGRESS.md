# PROGRESS.md

## In progress (phase C)

- **C1 done, reviewed & accepted** — WhisparrAPI (commit `580e2ec6`): sonarr
  port, calendar-year seasons, no language profiles (asserted in tests),
  episode↔TPDB-scene-id field left TODO pending live access. 18 tests.
- **C2 done, reviewed & accepted** — StashAPI GraphQL client (same commit),
  filter shapes verified against public stashapp schema. 9 tests.
- C3 (settings backend: single-server WhisparrSettings with searchOnRequest
  default OFF, StashSettings + pathMappings, Jellyfin `enabled` toggle,
  routes + seerr-api.yml entries) — delegated, running.
- C4/C5 (scanners) resequenced to AFTER live keys arrive — they are the
  verification-heavy parts. C6 (settings UI) follows C3.
- **Blocked on .env**: WHISPARR_API_KEY, STASH_URL, STASH_API_KEY still
  missing (only TPDB_API_KEY present). Also open: does Stash scrape with
  the TPDB scraper? (Determines D3 tier-2 id matching.)

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

- A3 (Scene/Site/Performer models + mappers) — after A2 + reference report
- Phase B (data model: scene/site MediaType, drop 4K, drop Postgres, migration)

## Open issues

- **DoD 2 deviation — "popular sites":** TPDB's public API has no working
  sort/order params (verified live; invalid values silently accepted). Recent
  scenes works (default order = newest first); sites can only be listed in
  default (alphabetical) order. Options: ship "Sites" slider as-is, or derive
  popularity locally from request counts later. Proceeding with default order
  unless directed otherwise.

- Per-episode TPDB scene-id location in Whisparr v2 unverified — needs live
  `/episode` access, deferred to phase C (agreed: no live Whisparr until C).
- Stash instance details (URL/key, whether it scrapes TPDB) — needed from C2.

## Test data added to Whisparr

- None. (No live Whisparr access yet; nothing to clean up.)
