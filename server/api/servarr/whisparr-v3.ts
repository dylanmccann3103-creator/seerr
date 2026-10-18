import logger from '@server/logger';
import ServarrBase from './base';

// Whisparr v3 drops the Sonarr-shaped site/season/episode model entirely and
// adopts Radarr's movie-style API: every StashDB scene is a single "movie"
// item, keyed by the StashDB UUID instead of a TMDB id. There is no
// site/series concept in v3 at all.
//
// UNVERIFIED against a live v3 instance: this user's v3 host
// (192.168.6.2:6969) answered the API probe with 401 (reachable, needs a key
// we don't have), so the shape below is built from Radarr's known v3
// contract rather than a live Whisparr v3 response. If your instance uses a
// different field name for the StashDB id, `foreignId` below (and the
// `stash:<id>` lookup term) is the one place to change.
export interface WhisparrV3Movie {
  id?: number;
  title: string;
  foreignId: string;
  year?: number;
  hasFile: boolean;
  monitored: boolean;
  qualityProfileId: number;
  path?: string;
  rootFolderPath?: string;
  tags: number[];
  added?: string;
  movieFile?: { id: number; path: string; relativePath?: string };
  images?: { coverType: string; url: string }[];
}

export interface AddSceneOptions {
  foreignId: string;
  title?: string;
  profileId: number;
  rootFolderPath: string;
  tags?: number[];
  monitored?: boolean;
  searchNow?: boolean;
}

class WhisparrV3API extends ServarrBase<{ movieId: number }> {
  constructor({ url, apiKey }: { url: string; apiKey: string }) {
    super({ url, apiKey, apiName: 'Whisparr v3', cacheName: 'whisparr' });
  }

  public async getScenes(): Promise<WhisparrV3Movie[]> {
    try {
      const response = await this.axios.get<WhisparrV3Movie[]>('/movie');
      return response.data;
    } catch (e) {
      throw new Error(`[Whisparr v3] Failed to retrieve scenes: ${e.message}`, {
        cause: e,
      });
    }
  }

  // Lookup term verified against the Radarr contract's `tmdb:<id>` pattern;
  // v3's equivalent for a StashDB-keyed scene is `stash:<id>`. Returns
  // undefined (rather than throwing) when nothing matches so callers can
  // distinguish "not found on StashDB-in-Whisparr" from a real API failure.
  public async getSceneByStashId(
    stashId: string
  ): Promise<WhisparrV3Movie | undefined> {
    try {
      const response = await this.axios.get<WhisparrV3Movie[]>(
        '/movie/lookup',
        { params: { term: `stash:${stashId}` } }
      );
      return response.data[0];
    } catch (e) {
      logger.error('Error retrieving scene by StashDB ID', {
        label: 'Whisparr v3 API',
        errorMessage: e.message,
        stashId,
      });
      throw e;
    }
  }

  public async addScene(options: AddSceneOptions): Promise<WhisparrV3Movie> {
    try {
      const lookup = await this.getSceneByStashId(options.foreignId);
      if (!lookup) {
        throw new Error('Scene not found in Whisparr v3 lookup');
      }

      if (lookup.id) {
        logger.info('Scene already exists in Whisparr v3', {
          label: 'Whisparr v3',
          movieId: lookup.id,
        });
        return lookup;
      }

      const response = await this.axios.post<WhisparrV3Movie>('/movie', {
        title: options.title ?? lookup.title,
        foreignId: options.foreignId,
        qualityProfileId: options.profileId,
        rootFolderPath: options.rootFolderPath,
        monitored: options.monitored ?? true,
        tags: options.tags ?? [],
        addOptions: {
          searchForMovie: options.searchNow ?? false,
        },
      } as Partial<WhisparrV3Movie>);

      if (!response.data.id) {
        logger.error('Failed to add scene to Whisparr v3', {
          label: 'Whisparr v3',
          options,
        });
        throw new Error('Failed to add scene to Whisparr v3');
      }

      logger.info('Whisparr v3 accepted scene', { label: 'Whisparr v3' });
      logger.debug('Whisparr v3 add details', {
        label: 'Whisparr v3',
        scene: response.data,
      });

      if (options.searchNow && response.data.id) {
        this.searchScene(response.data.id);
      }

      return response.data;
    } catch (e) {
      logger.error(
        'Something went wrong while adding a scene to Whisparr v3.',
        {
          label: 'Whisparr v3 API',
          errorMessage: e.message,
          options,
          response: e?.response?.data,
        }
      );
      throw new Error('Failed to add scene', { cause: e });
    }
  }

  public async searchScene(movieId: number): Promise<void> {
    logger.info('Executing scene search command.', {
      label: 'Whisparr v3 API',
      movieId,
    });

    try {
      await this.runCommand('MoviesSearch', { movieIds: [movieId] });
    } catch (e) {
      logger.error(
        'Something went wrong while executing Whisparr v3 scene search.',
        {
          label: 'Whisparr v3 API',
          errorMessage: e.message,
          movieId,
        }
      );
    }
  }

  public removeScene = async (foreignId: string): Promise<void> => {
    const existing = await this.getSceneByStashId(foreignId);

    if (!existing?.id) {
      logger.info('[Whisparr v3] Scene not in library, nothing to remove', {
        foreignId,
      });
      return;
    }

    try {
      await this.axios.delete(`/movie/${existing.id}`, {
        params: { deleteFiles: true, addImportExclusion: false },
      });
      logger.info(`[Whisparr v3] Removed scene ${existing.title}`);
    } catch (e) {
      if (e?.response?.status === 404) {
        logger.info('[Whisparr v3] Scene already removed from Whisparr', {
          foreignId,
        });
        return;
      }
      throw e;
    }
  };

  public clearCache = ({
    foreignId,
    externalId,
  }: {
    foreignId?: string | null;
    externalId?: number | null;
  }) => {
    if (foreignId) {
      this.removeCache('/movie/lookup', { term: `stash:${foreignId}` });
    }
    if (externalId) {
      this.removeCache(`/movie/${externalId}`);
    }
  };
}

export default WhisparrV3API;
