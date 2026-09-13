import ExternalAPI from '@server/api/externalapi';
import type {
  TpdbPaginatedResponse,
  TpdbPerformer,
  TpdbScene,
  TpdbSingleResponse,
  TpdbSite,
  TpdbTag,
} from '@server/api/tpdb/interfaces';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';

export const SCENE_ORDER_BY = [
  'most_relevant',
  'recently_released',
  'former_released',
  'recently_created',
  'recently_updated',
  'duration_desc',
  'duration_asc',
] as const;
export type SceneOrderBy = (typeof SCENE_ORDER_BY)[number];

export const PERFORMER_ORDER_BY = [
  'most_relevant',
  'asc_name',
  'desc_name',
  'recently_created',
  'recently_updated',
  'recently_birthed',
  'reverse_birthed',
] as const;
export type PerformerOrderBy = (typeof PERFORMER_ORDER_BY)[number];

export interface SceneListOptions extends PageOptions {
  tags?: number[];
  siteId?: number;
  year?: number;
  orderBy?: SceneOrderBy;
}

export interface PerformerListOptions extends PageOptions {
  orderBy?: PerformerOrderBy;
  gender?: string;
  ethnicity?: string;
  hairColour?: string;
  eyeColour?: string;
  letter?: string;
}

interface PageOptions {
  page?: number;
}

interface SearchOptions extends PageOptions {
  query: string;
}

// ThePornDB (TPDB) metadata client, the Whisparr-side equivalent of TheMovieDb.
// Base https://api.theporndb.net, auth is `Authorization: Bearer <key>` rather
// than a query param like TMDB.
//
// Query params verified live against the API (2026-09):
// - search: `q=<term>` on /scenes, /sites, /performers (not `parse` or `query`).
// - pagination: `page=<n>`, response `meta` is a standard Laravel paginator
//   (current_page/last_page/per_page/from/to/total).
// - filtering: /scenes?site_id=<id> filters scenes to one site.
// - sorting: no `sort`/`order`/`orderby` param has any observed effect — tried
//   sort=-date, sort=date, sort=-created, sort=-rating on both /scenes and
//   /sites; invalid values are silently ignored (no validation error) and the
//   result order never changed. So:
//     - /scenes with no `q` is already newest-first by default -> that's what
//       getRecentScenes uses.
//     - /sites has no popularity/trending ordering available; default order is
//       alphabetical by name. getPopularSites therefore just returns the
//       default site listing (documented here since there's no way to sort by
//       popularity server-side).
class Tpdb extends ExternalAPI {
  constructor() {
    const settings = getSettings();
    const apiKey = settings.tpdb.apiKey || process.env.TPDB_API_KEY || '';

    super(
      'https://api.theporndb.net',
      {},
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        nodeCache: cacheManager.getCache('tpdb').data,
        rateLimit: {
          // Conservative vs TMDB's 20/50 since TPDB's limits aren't documented.
          maxRequests: 20,
          maxRPS: 10,
        },
      }
    );
  }

  public searchScenes = async ({
    query,
    page = 1,
  }: SearchOptions): Promise<TpdbPaginatedResponse<TpdbScene>> => {
    return this.get<TpdbPaginatedResponse<TpdbScene>>('/scenes', {
      params: { q: query, page },
    });
  };

  public searchSites = async ({
    query,
    page = 1,
  }: SearchOptions): Promise<TpdbPaginatedResponse<TpdbSite>> => {
    return this.get<TpdbPaginatedResponse<TpdbSite>>('/sites', {
      params: { q: query, page },
    });
  };

  public searchPerformers = async ({
    query,
    page = 1,
  }: SearchOptions): Promise<TpdbPaginatedResponse<TpdbPerformer>> => {
    return this.get<TpdbPaginatedResponse<TpdbPerformer>>('/performers', {
      params: { q: query, page },
    });
  };

  public getScene = async ({
    sceneId,
  }: {
    sceneId: string;
  }): Promise<TpdbScene> => {
    const response = await this.get<TpdbSingleResponse<TpdbScene>>(
      `/scenes/${sceneId}`
    );
    return response.data;
  };

  public getSite = async ({
    siteId,
  }: {
    siteId: number;
  }): Promise<TpdbSite> => {
    const response = await this.get<TpdbSingleResponse<TpdbSite>>(
      `/sites/${siteId}`
    );
    return response.data;
  };

  public getPerformer = async ({
    performerId,
  }: {
    performerId: string;
  }): Promise<TpdbPerformer> => {
    const response = await this.get<TpdbSingleResponse<TpdbPerformer>>(
      `/performers/${performerId}`
    );
    return response.data;
  };

  // Filters verified live (2026-09, see openapi.json on the API host):
  // `tags[<id>]=<anything>` (Laravel deepObject, key = tag id, value ignored),
  // `site_id`, `year`, `orderBy` (enum below). No `q` = newest first.
  public getRecentScenes = async ({
    page = 1,
    tags,
    siteId,
    year,
    orderBy,
  }: SceneListOptions = {}): Promise<TpdbPaginatedResponse<TpdbScene>> => {
    const params: Record<string, string | number> = { page };
    for (const id of tags ?? []) {
      params[`tags[${id}]`] = 1;
    }
    if (siteId) params.site_id = siteId;
    if (year) params.year = year;
    if (orderBy) params.orderBy = orderBy;
    return this.get<TpdbPaginatedResponse<TpdbScene>>('/scenes', { params });
  };

  // /sites only supports `q` and `letter`; the default order is alphabetical.
  public getPopularSites = async ({
    page = 1,
    letter,
  }: PageOptions & { letter?: string } = {}): Promise<
    TpdbPaginatedResponse<TpdbSite>
  > => {
    return this.get<TpdbPaginatedResponse<TpdbSite>>('/sites', {
      params: { page, ...(letter ? { letter } : {}) },
    });
  };

  // Enum values are title case with spaces ("Transgender Female", "Middle
  // Eastern"); the openapi's UPPER_SNAKE spelling is rejected.
  public getPerformers = async ({
    page = 1,
    orderBy,
    gender,
    ethnicity,
    hairColour,
    eyeColour,
    letter,
  }: PerformerListOptions = {}): Promise<
    TpdbPaginatedResponse<TpdbPerformer>
  > => {
    const params: Record<string, string | number> = { page };
    if (orderBy) params.orderBy = orderBy;
    if (gender) params.gender = gender;
    if (ethnicity) params.ethnicity = ethnicity;
    if (hairColour) params.hair_colour = hairColour;
    if (eyeColour) params.eye_colour = eyeColour;
    if (letter) params.letter = letter;
    return this.get<TpdbPaginatedResponse<TpdbPerformer>>('/performers', {
      params,
    });
  };

  public getTags = async ({
    query,
    page = 1,
  }: PageOptions & { query?: string } = {}): Promise<
    TpdbPaginatedResponse<TpdbTag>
  > => {
    return this.get<TpdbPaginatedResponse<TpdbTag>>('/tags', {
      params: { page, orderBy: 'asc_name', ...(query ? { q: query } : {}) },
    });
  };

  // `performer_id` takes the global performer's numeric `_id` (live-verified).
  public getPerformerScenes = async ({
    performerId,
    page = 1,
  }: PageOptions & { performerId: number }): Promise<
    TpdbPaginatedResponse<TpdbScene>
  > => {
    return this.get<TpdbPaginatedResponse<TpdbScene>>('/scenes', {
      params: { performer_id: performerId, page },
    });
  };

  public getSiteScenes = async ({
    siteId,
    page = 1,
  }: PageOptions & { siteId: number }): Promise<
    TpdbPaginatedResponse<TpdbScene>
  > => {
    return this.get<TpdbPaginatedResponse<TpdbScene>>('/scenes', {
      params: { site_id: siteId, page },
    });
  };
}

export default Tpdb;
