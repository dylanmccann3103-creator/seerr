import defineMessages from '@app/utils/defineMessages';

export const sliderTitles = defineMessages('components.Discover', {
  recentrequests: 'Recent Requests',
  recentscenes: 'Recent Scenes',
  sites: 'Sites',
  performers: 'Performers',
  recentlyAdded: 'Recently Added',
});

import type { ParsedUrlQuery } from 'querystring';

export const sceneSortOptions = [
  'recently_released',
  'former_released',
  'most_relevant',
  'recently_created',
  'recently_updated',
  'duration_desc',
  'duration_asc',
] as const;

export const performerSortOptions = [
  'most_relevant',
  'asc_name',
  'desc_name',
  'recently_created',
  'recently_updated',
  'recently_birthed',
  'reverse_birthed',
] as const;

// Exact TPDB values (title case with spaces), sent through as-is.
export const performerFilterValues = {
  gender: [
    'Female',
    'Male',
    'Transgender Female',
    'Transgender Male',
    'Non Binary',
    'Intersex',
    'Unknown',
  ],
  ethnicity: [
    'Asian',
    'Black',
    'Caucasian',
    'Indian',
    'Latin',
    'Middle Eastern',
    'Mixed',
    'Other',
  ],
  hairColour: [
    'Auburn',
    'Bald',
    'Black',
    'Blonde',
    'Brunette',
    'Grey',
    'Other',
    'Red',
    'Various',
    'White',
  ],
  eyeColour: ['Blue', 'Brown', 'Green', 'Grey', 'Hazel', 'Red'],
} as const;

export interface TagRef {
  id: number;
  name: string;
}

// Query-string shape sent to /api/v1/discover/scenes.
export interface SceneFilterOptions {
  tags?: string; // comma-separated ids for the API
  tagAnd?: string; // '1' = scene must carry every tag
  siteId?: string;
  year?: string;
  orderBy?: string;
}

export interface PerformerFilterOptions {
  orderBy?: string;
  gender?: string;
  ethnicity?: string;
  hairColour?: string;
  eyeColour?: string;
  letter?: string;
}

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v || undefined;

// URL keeps `tags=70:Anal|13316:Anal Masturbation` so chips render without a lookup.
export const parseTagParam = (value?: string): TagRef[] =>
  (value ?? '')
    .split('|')
    .map((pair) => {
      const idx = pair.indexOf(':');
      return { id: Number(pair.slice(0, idx)), name: pair.slice(idx + 1) };
    })
    .filter((t) => t.id > 0 && t.name);

export const serializeTagParam = (tags: TagRef[]): string | undefined =>
  tags.length ? tags.map((t) => `${t.id}:${t.name}`).join('|') : undefined;

export const prepareSceneFilters = (
  query: ParsedUrlQuery
): { api: SceneFilterOptions; tags: TagRef[]; siteName?: string } => {
  const tags = parseTagParam(first(query.tags));
  const api: SceneFilterOptions = {};
  if (tags.length) api.tags = tags.map((t) => t.id).join(',');
  if (tags.length > 1 && first(query.tagAnd) === '1') api.tagAnd = '1';
  const siteId = first(query.siteId);
  if (siteId) api.siteId = siteId;
  const year = first(query.year);
  if (year) api.year = year;
  const orderBy = first(query.orderBy);
  if (orderBy) api.orderBy = orderBy;
  return { api, tags, siteName: first(query.siteName) };
};

export const preparePerformerFilters = (
  query: ParsedUrlQuery
): PerformerFilterOptions => {
  const api: PerformerFilterOptions = {};
  for (const key of [
    'orderBy',
    'gender',
    'ethnicity',
    'hairColour',
    'eyeColour',
    'letter',
  ] as const) {
    const v = first(query[key]);
    if (v) api[key] = v;
  }
  return api;
};

// Sort is not a filter.
export const countActiveFilters = (
  filters: SceneFilterOptions | PerformerFilterOptions
): number =>
  Object.entries(filters).filter(
    ([k, v]) => k !== 'orderBy' && k !== 'tagAnd' && v
  ).length;
