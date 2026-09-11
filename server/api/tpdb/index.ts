import ExternalAPI from '@server/api/externalapi';
import type {
  TpdbPaginatedResponse,
  TpdbPerformer,
  TpdbScene,
  TpdbSingleResponse,
  TpdbSite,
} from '@server/api/tpdb/interfaces';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';

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

  // Newest-first: /scenes with no `q` is already sorted newest-first by
  // default (no sort param changes this — see class comment).
  public getRecentScenes = async ({ page = 1 }: PageOptions = {}): Promise<
    TpdbPaginatedResponse<TpdbScene>
  > => {
    return this.get<TpdbPaginatedResponse<TpdbScene>>('/scenes', {
      params: { page },
    });
  };

  // No popularity/trending sort exists on the public API (see class comment) —
  // this is the default (alphabetical) site listing.
  public getPopularSites = async ({ page = 1 }: PageOptions = {}): Promise<
    TpdbPaginatedResponse<TpdbSite>
  > => {
    return this.get<TpdbPaginatedResponse<TpdbSite>>('/sites', {
      params: { page },
    });
  };

  public getPerformers = async ({ page = 1 }: PageOptions = {}): Promise<
    TpdbPaginatedResponse<TpdbPerformer>
  > => {
    return this.get<TpdbPaginatedResponse<TpdbPerformer>>('/performers', {
      params: { page },
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
