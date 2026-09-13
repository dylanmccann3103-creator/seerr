import StashAPI from '@server/api/stash';
import type { StashPerformer } from '@server/api/stash/interfaces';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

// Performer images from the user's own Stash, used only when TPDB has none.
// Match order: TPDB uuid stored as a stash_id (exact), then an exact name or
// alias match on a name search. Never a fuzzy match: a wrong face is worse
// than no face (StashDB name search measured 1 right / 2 wrong per 25).

const norm = (s: string) => s.trim().toLowerCase();

export const pickExactPerformer = (
  name: string,
  candidates: StashPerformer[]
): StashPerformer | undefined =>
  candidates.find(
    (p) =>
      norm(p.name) === norm(name) ||
      (p.alias_list ?? []).some((a) => norm(a) === norm(name))
  );

// Stash serves its images itself, behind the ApiKey, so the client gets the
// proxy path; the `?t=` cache-buster is dropped (the proxy caches on path).
export const toStashProxyPath = (imagePath: string): string | undefined => {
  try {
    return `/imageproxy/stash${new URL(imagePath).pathname}`;
  } catch {
    return undefined;
  }
};

const performerImage = async (
  api: StashAPI,
  performer: { id: string; name: string }
): Promise<string | undefined> => {
  const byId = await api.findPerformersByStashId(performer.id);
  const match =
    byId.find((p) => p.image_path) ??
    pickExactPerformer(
      performer.name,
      await api.searchPerformers(performer.name)
    );
  return match?.image_path ? toStashProxyPath(match.image_path) : undefined;
};

export const stashPerformerImage = async (performer: {
  id: string;
  name: string;
}): Promise<string | undefined> => {
  const { stash } = getSettings();
  if (!stash.enabled || !stash.url) {
    return undefined;
  }
  const cache = cacheManager.getCache('stash').data;
  const key = `performer-image:${performer.id}`;
  const cached = cache.get<string>(key);
  if (cached !== undefined) {
    return cached || undefined;
  }
  try {
    const path = await performerImage(
      new StashAPI({ url: stash.url, apiKey: stash.apiKey }),
      performer
    );
    cache.set(key, path ?? ''); // misses are cached too
    return path;
  } catch (e) {
    logger.debug('Stash performer image lookup failed', {
      label: 'Stash',
      performer: performer.name,
      errorMessage: e.message,
    });
    return undefined;
  }
};

// Fills `posterPath` from Stash for the mapped items TPDB left without one.
// `raw[i]` must correspond to `mapped[i]`.
export const withStashPerformerImages = async <
  T extends { posterPath?: string },
>(
  raw: { id: string; name: string }[],
  mapped: T[]
): Promise<T[]> =>
  Promise.all(
    mapped.map(async (item, i) =>
      item.posterPath || !raw[i]
        ? item
        : { ...item, posterPath: await stashPerformerImage(raw[i]) }
    )
  );
