import type { SceneListOptions } from '@server/api/tpdb';
import { SCENE_ORDER_BY } from '@server/api/tpdb';

// Query params come straight from the URL; anything unknown is dropped.
export const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;
export const oneOf = <T extends string>(
  v: unknown,
  allowed: readonly T[]
): T | undefined => (allowed.includes(v as T) ? (v as T) : undefined);
export const int = (v: unknown): number | undefined =>
  Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : undefined;
export const letter = (v: unknown): string | undefined =>
  typeof v === 'string' && /^[a-z]$/i.test(v) ? v.toLowerCase() : undefined;

// Shared by /discover/scenes and /search.
export const parseSceneFilters = (
  query: Record<string, unknown>
): Omit<SceneListOptions, 'page'> => ({
  tags: (str(query.tags) ?? '')
    .split(',')
    .map(int)
    .filter((id): id is number => id !== undefined),
  tagAnd: query.tagAnd === 'true' || query.tagAnd === '1',
  siteId: int(query.siteId),
  year: int(query.year),
  orderBy: oneOf(query.orderBy, SCENE_ORDER_BY),
});

export const hasSceneFilters = (f: Omit<SceneListOptions, 'page'>): boolean =>
  (f.tags?.length ?? 0) > 0 || !!f.siteId || !!f.year || !!f.orderBy;
