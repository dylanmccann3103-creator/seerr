import type { WhisparrV3Movie } from '@server/api/servarr/whisparr-v3';
import WhisparrV3API from '@server/api/servarr/whisparr-v3';
import StashDb from '@server/api/stashdb';
import Tpdb from '@server/api/tpdb';
import type { TpdbScene } from '@server/api/tpdb/interfaces';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

// TPDB embeds cross-references to other databases (StashDB, IAFD, ...) on a
// scene, but the shape varies by scene and isn't modeled in TpdbScene.links
// (typed `unknown[]`, see server/api/tpdb/interfaces.ts). Rather than guess
// that shape, scan the raw JSON for a stashdb.org scene URL and pull the UUID
// out of it — works regardless of exactly how TPDB nests the link.
const STASHDB_URL_RE =
  /stashdb\.org\/scenes\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function extractStashIdFromLinks(scene: TpdbScene): string | undefined {
  const haystack = JSON.stringify(scene.links ?? []);
  return haystack.match(STASHDB_URL_RE)?.[1];
}

// Direct link first, then a best-effort StashDB search on studio + date +
// title (PLAN per the v3 task spec). Returns undefined — never throws — so
// callers can treat "not found" as a normal outcome rather than an error.
export async function resolveStashId(
  scene: TpdbScene
): Promise<string | undefined> {
  const direct = extractStashIdFromLinks(scene);
  if (direct) {
    return direct;
  }

  if (!scene.title) {
    return undefined;
  }

  try {
    return await new StashDb().findSceneByStudioDateTitle({
      studioName: scene.site?.name,
      date: scene.date,
      title: scene.title,
    });
  } catch (e) {
    logger.warn('Failed to resolve StashDB id for scene', {
      label: 'Whisparr v3',
      errorMessage: e.message,
      tpdbSceneId: scene.id,
    });
    return undefined;
  }
}

export type SendSceneResult =
  | { status: 'not_found' }
  | {
      status: 'added' | 'skipped';
      externalServiceId: number;
      hasFile: boolean;
      movie: WhisparrV3Movie;
    };

// Shared by the per-request dispatch (MediaRequestSubscriber) and the bulk
// "resend to v3" admin action: resolve a TPDB scene to a StashDB id, then add
// it (or return the existing entry, unchanged) via the v3 client.
export async function sendSceneToWhisparrV3({
  tpdbId,
  profileId,
  rootFolderPath,
  tags,
  searchNow,
}: {
  tpdbId: string;
  profileId: number;
  rootFolderPath: string;
  tags?: number[];
  searchNow?: boolean;
}): Promise<SendSceneResult> {
  const { whisparr } = getSettings();
  const scene = await new Tpdb().getScene({ sceneId: tpdbId });
  const stashId = await resolveStashId(scene);

  if (!stashId) {
    return { status: 'not_found' };
  }

  const api = new WhisparrV3API({
    apiKey: whisparr.apiKey,
    url: WhisparrV3API.buildUrl(whisparr, '/api/v3'),
  });

  const existing = await api.getSceneByStashId(stashId);
  if (existing?.id) {
    return {
      status: 'skipped',
      externalServiceId: existing.id,
      hasFile: existing.hasFile,
      movie: existing,
    };
  }

  const added = await api.addScene({
    foreignId: stashId,
    title: scene.title,
    profileId,
    rootFolderPath,
    tags,
    monitored: true,
    searchNow: searchNow ?? whisparr.searchOnAddV3,
  });

  if (!added.id) {
    throw new Error('Whisparr v3 returned a scene without an id');
  }

  return {
    status: 'added',
    externalServiceId: added.id,
    hasFile: added.hasFile,
    movie: added,
  };
}
