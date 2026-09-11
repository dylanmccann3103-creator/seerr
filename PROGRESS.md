# PROGRESS.md

## Done

- **Plan** — PLAN.md written, D1–D5 approved (checkpoint 1 passed 2026-09-11).
- **A1 — ID verification**: real Whisparr v2 `/api/v3/series` payload analyzed
  (`.context/`, gitignored). Confirmed: `tvdbId` field carries TPDB site ids
  (cross-checked against TPDB `/sites/{id}`: name + network match exactly);
  seasons = calendar years; no `languageProfileId` in v2; no StashDB ids anywhere.
  TPDB API probe: auth OK, Laravel-style pagination, **zero** StashDB-id coverage
  → Stash availability matching = path matching (PLAN.md D3 revised accordingly).

## In progress (phase A)

- A2+A5 (merged: TPDB client + tpdb settings block) — delegated, running
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

- Per-episode TPDB scene-id location in Whisparr v2 unverified — needs live
  `/episode` access, deferred to phase C (agreed: no live Whisparr until C).
- Stash instance details (URL/key, whether it scrapes TPDB) — needed from C2.

## Test data added to Whisparr

- None. (No live Whisparr access yet; nothing to clean up.)
