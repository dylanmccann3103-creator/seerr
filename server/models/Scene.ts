import type {
  TpdbScene,
  TpdbScenePerformer,
  TpdbSite,
  TpdbTag,
} from '@server/api/tpdb/interfaces';
import type Media from '@server/entity/Media';

// Defensive caps: TPDB doesn't paginate embedded arrays, so a malformed/huge
// response can't blow up card rendering.
const MAX_PERFORMERS = 50;
const MAX_TAGS = 100;

// TPDB's stable identifier is the string `id` (uuid-shaped); `_id` is an
// optional legacy numeric id. We keep a numeric `id` field for parity with
// the Movie/Tv models (used to match against local Media rows later), so
// fall back to 0 on the rare response that omits `_id`.
// ponytail: revisit if any TPDB endpoint reliably omits `_id` in practice.
const numericId = (id?: number): number => id ?? 0;

interface SceneSiteRef {
  id: number;
  name: string;
}

export interface ScenePerformerRef {
  id: number;
  name: string;
  posterPath?: string;
}

export interface SceneTag {
  id: number;
  name: string;
}

export interface SceneDetails {
  id: number;
  uuid: string;
  slug?: string;
  title: string;
  overview?: string;
  releaseDate?: string;
  duration?: number;
  posterPath?: string;
  backdropPath?: string;
  site?: SceneSiteRef;
  performers: ScenePerformerRef[];
  tags: SceneTag[];
  trailer?: string;
  url?: string;
  mediaInfo?: Media;
}

const mapSceneSiteRef = (site: TpdbSite): SceneSiteRef => ({
  id: site.id,
  name: site.name,
});

// Scene payloads embed site-performers; only the parent's id resolves on
// /performers/{id} (live-verified 2026-09-12). A site-performer without a
// parent (e.g. a creator's own site) has no profile at all: id 0, so the UI
// links to search instead of a 404.
const mapScenePerformerRef = (
  performer: TpdbScenePerformer
): ScenePerformerRef => ({
  id: numericId(
    performer.parent?._id ?? (performer.is_parent ? performer._id : undefined)
  ),
  name: performer.name,
  posterPath: performer.image ?? performer.thumbnail ?? undefined,
});

const mapSceneTag = (tag: TpdbTag): SceneTag => ({
  id: tag.id,
  name: tag.name,
});

export const mapSceneDetails = (
  scene: TpdbScene,
  media?: Media
): SceneDetails => ({
  id: numericId(scene._id),
  uuid: scene.id,
  slug: scene.slug,
  title: scene.title,
  overview: scene.description ?? undefined,
  releaseDate: scene.date,
  duration: scene.duration,
  posterPath: scene.poster ?? scene.posters?.large ?? undefined,
  backdropPath: scene.background?.large ?? scene.background?.full ?? undefined,
  site: scene.site ? mapSceneSiteRef(scene.site) : undefined,
  performers: (scene.performers ?? [])
    .slice(0, MAX_PERFORMERS)
    .map(mapScenePerformerRef),
  tags: (scene.tags ?? []).slice(0, MAX_TAGS).map(mapSceneTag),
  trailer: scene.trailer ?? undefined,
  url: scene.url,
  mediaInfo: media,
});

export interface SceneResult {
  id: number;
  title: string;
  posterPath?: string;
  mediaType: 'scene';
  mediaInfo?: Media;
}

export const mapSceneResult = (
  scene: TpdbScene,
  media?: Media
): SceneResult => ({
  id: numericId(scene._id),
  title: scene.title,
  posterPath: scene.poster ?? scene.posters?.large ?? undefined,
  mediaType: 'scene',
  mediaInfo: media,
});
