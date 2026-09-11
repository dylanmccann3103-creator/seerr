import type { TpdbPerformer } from '@server/api/tpdb/interfaces';

// Defensive cap: TPDB doesn't paginate embedded arrays.
const MAX_ALIASES = 20;

// TPDB's stable identifier is the string `id` (uuid-shaped); `_id` is an
// optional legacy numeric id. See Scene.ts for the same tradeoff.
// ponytail: revisit if any TPDB endpoint reliably omits `_id` in practice.
const numericId = (id?: number): number => id ?? 0;

// Performers are browse-only in this app (no local Media row, no requests),
// so unlike Scene/Site there is no `mediaInfo`/`Media` parameter here.
export interface PerformerDetails {
  id: number;
  uuid: string;
  slug?: string;
  name: string;
  bio?: string;
  posterPath?: string;
  aliases?: string[];
}

export const mapPerformerDetails = (
  performer: TpdbPerformer
): PerformerDetails => ({
  id: numericId(performer._id),
  uuid: performer.id,
  slug: performer.slug,
  name: performer.name,
  bio: performer.bio ?? undefined,
  posterPath: performer.image ?? performer.thumbnail ?? undefined,
  aliases: performer.aliases?.slice(0, MAX_ALIASES),
});

export interface PerformerResult {
  id: number;
  name: string;
  posterPath?: string;
  mediaType: 'performer';
}

export const mapPerformerResult = (
  performer: TpdbPerformer
): PerformerResult => ({
  id: numericId(performer._id),
  name: performer.name,
  posterPath: performer.image ?? performer.thumbnail ?? undefined,
  mediaType: 'performer',
});
