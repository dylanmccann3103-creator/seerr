import ExternalAPI from '@server/api/externalapi';
import type {
  StashFindScenesResult,
  StashGraphQLResponse,
  StashScene,
  StashStats,
  StashSystemStatus,
} from '@server/api/stash/interfaces';

// Stash (stashapp/stash) GraphQL client. Single endpoint: POST <base>/graphql with
// `{ query, variables }`, auth via the literal header `ApiKey: <key>` (not
// `Authorization: Bearer`, unlike TPDB/TMDB).
//
// Query/filter shapes verified against the public schema at
// https://github.com/stashapp/stash/tree/develop/graphql/schema/types (2026-09):
// - `findScenes(scene_filter: SceneFilterType, filter: FindFilterType): FindScenesResultType!`
// - `SceneFilterType.path: StringCriterionInput` -> `{ value: String!, modifier: CriterionModifier! }`
// - `SceneFilterType.stash_ids_endpoint: StashIDsCriterionInput` -> `{ stash_ids: [String],
//   modifier: CriterionModifier! }` (used over the deprecated singular `stash_id_endpoint`)
// - `systemStatus: SystemStatus!` (`databaseSchema`, `appSchema`, `status`)
// - `stats: StatsResultType!` (`scene_count`)
//
// No per-instance nodeCache: a cache id would need registering in
// `server/lib/cache.ts`, which this task doesn't own. Availability lookups are
// short-lived anyway (matching runs read-through), so an uncached POST is fine for now.
const SCENE_FIELDS = `
  id
  title
  paths {
    screenshot
    stream
  }
  files {
    path
  }
  stash_ids {
    endpoint
    stash_id
  }
`;

class StashAPI extends ExternalAPI {
  constructor({ url, apiKey }: { url: string; apiKey: string }) {
    super(
      url,
      {},
      {
        headers: {
          ApiKey: apiKey,
        },
      }
    );
  }

  private graphql = async <T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> => {
    const response = await this.post<StashGraphQLResponse<T>>('/graphql', {
      query,
      variables: variables ?? {},
    });

    if (response.errors?.length) {
      throw new Error(
        `Stash GraphQL error: ${response.errors.map((e) => e.message).join(', ')}`
      );
    }

    if (!response.data) {
      throw new Error('Stash GraphQL response had no data');
    }

    return response.data;
  };

  // Used by the settings connection test.
  public getSystemStatus = async (): Promise<StashSystemStatus> => {
    const data = await this.graphql<{ systemStatus: StashSystemStatus }>(
      `query SystemStatus {
        systemStatus {
          databaseSchema
          appSchema
          status
        }
      }`
    );
    return data.systemStatus;
  };

  // Used by the settings connection test.
  public getSceneCount = async (): Promise<number> => {
    const data = await this.graphql<{ stats: StashStats }>(
      `query Stats {
        stats {
          scene_count
        }
      }`
    );
    return data.stats.scene_count;
  };

  // Availability match by file path (phase D does path normalization; this just
  // passes the path through as an exact-match filter).
  public findSceneByPath = async (path: string): Promise<StashScene | null> => {
    const data = await this.graphql<{ findScenes: StashFindScenesResult }>(
      `query FindSceneByPath($path: String!) {
        findScenes(
          scene_filter: { path: { value: $path, modifier: EQUALS } }
          filter: { per_page: 1 }
        ) {
          count
          scenes {
            ${SCENE_FIELDS}
          }
        }
      }`,
      { path }
    );
    return data.findScenes.scenes[0] ?? null;
  };

  // Availability match by stash_id (cross-referenced against a stash-box endpoint,
  // e.g. StashDB). Filters on the non-deprecated `stash_ids_endpoint` field.
  public findScenesByStashId = async (
    stashId: string
  ): Promise<StashScene[]> => {
    const data = await this.graphql<{ findScenes: StashFindScenesResult }>(
      `query FindScenesByStashId($stashId: String!) {
        findScenes(
          scene_filter: {
            stash_ids_endpoint: { stash_ids: [$stashId], modifier: INCLUDES }
          }
        ) {
          count
          scenes {
            ${SCENE_FIELDS}
          }
        }
      }`,
      { stashId }
    );
    return data.findScenes.scenes;
  };

  // Deep link for "Play in Stash" buttons in the request UI.
  public static buildSceneUrl(baseUrl: string, sceneId: string): string {
    return `${baseUrl.replace(/\/+$/, '')}/scenes/${sceneId}`;
  }
}

export default StashAPI;
