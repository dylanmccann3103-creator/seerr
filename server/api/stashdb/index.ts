import ExternalAPI from '@server/api/externalapi';
import type { StashDbScene } from '@server/api/stashdb/interfaces';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';

interface GraphQlResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

// StashDB (https://stashdb.org) is the scene database Whisparr v3 keys its
// library on. Auth is a plain `ApiKey` header — verified live 2026-10: an
// unauthenticated `searchScenes`/`queryScenes` call comes back with a GraphQL
// error `"not authorized"` rather than a 401, so errors must be read out of
// the body, not the status code.
class StashDb extends ExternalAPI {
  constructor() {
    const apiKey = getSettings().whisparr.stashDbApiKey || '';

    super(
      'https://stashdb.org/graphql',
      {},
      {
        headers: { ApiKey: apiKey },
        nodeCache: cacheManager.getCache('stashdb').data,
      }
    );
  }

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown>
  ): Promise<T> {
    const response = await this.post<GraphQlResponse<T>>(
      '',
      { query, variables },
      undefined,
      21600
    );

    if (response.errors?.length) {
      throw new Error(
        `StashDB GraphQL error: ${response.errors.map((e) => e.message).join('; ')}`
      );
    }
    if (!response.data) {
      throw new Error('StashDB returned no data');
    }
    return response.data;
  }

  // Fallback match for a TPDB scene that carries no direct StashDB link:
  // resolve the studio name to a StashDB studio id first (schema has no
  // studio-by-name filter), then query scenes by studio + release date +
  // title, in that priority order (all three are optional filters; StashDB
  // itself decides relevance/ordering beyond that). Returns the first
  // match's id, or undefined.
  public async findSceneByStudioDateTitle({
    studioName,
    date,
    title,
  }: {
    studioName?: string;
    date?: string;
    title: string;
  }): Promise<string | undefined> {
    let studioId: string | undefined;
    if (studioName) {
      const { searchStudio } = await this.graphql<{
        searchStudio: { id: string; name: string }[];
      }>(
        `query($term: String!) { searchStudio(term: $term, limit: 5) { id name } }`,
        {
          term: studioName,
        }
      );
      studioId = searchStudio[0]?.id;
    }

    const input: Record<string, unknown> = {
      title,
      page: 1,
      per_page: 5,
      sort: 'TITLE',
      direction: 'ASC',
    };
    if (studioId) {
      input.studios = { value: [studioId], modifier: 'INCLUDES' };
    }
    if (date) {
      input.date = { value: date, modifier: 'EQUALS' };
    }

    const { queryScenes } = await this.graphql<{
      queryScenes: { scenes: StashDbScene[] };
    }>(
      `query($input: SceneQueryInput!) {
        queryScenes(input: $input) {
          scenes { id title release_date studio { id name } }
        }
      }`,
      { input }
    );

    return queryScenes.scenes[0]?.id;
  }
}

export default StashDb;
