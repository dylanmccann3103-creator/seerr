import logger from '@server/logger';
import type { AxiosResponse } from 'axios';
import ServarrBase from './base';

export interface WhisparrSeason {
  seasonNumber: number;
  monitored: boolean;
  statistics?: {
    previousAiring?: string;
    episodeFileCount: number;
    episodeCount: number;
    totalEpisodeCount: number;
    sizeOnDisk: number;
    percentOfEpisodes: number;
  };
}
interface EpisodeResult {
  seriesId: number;
  episodeFileId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  airDate: string;
  airDateUtc: string;
  overview: string;
  hasFile: boolean;
  monitored: boolean;
  absoluteEpisodeNumber: number;
  unverifiedSceneNumbering: boolean;
  /** TPDB scene numeric `_id` (NOT the uuid `id`) — live-verified 2026-09-12 against /episode */
  tvdbId: number;
  /** Also live: `releaseDate` (YYYY-MM-DD) instead of airDate, and `actors[].tpdbId`. */
  releaseDate?: string;
  id: number;
}

export interface WhisparrSite {
  title: string;
  sortTitle: string;
  seasonCount: number;
  status: string;
  overview: string;
  network: string;
  airTime: string;
  images: {
    coverType: string;
    url: string;
  }[];
  remotePoster: string;
  seasons: WhisparrSeason[];
  year: number;
  path: string;
  profileId: number;
  seasonFolder: boolean;
  monitored: boolean;
  monitorNewItems: 'all' | 'none';
  useSceneNumbering: boolean;
  runtime: number;
  /** TPDB site id — Whisparr v2 repurposes Sonarr's tvdbId field */
  tvdbId: number;
  tvRageId: number;
  tvMazeId: number;
  firstAired: string;
  lastInfoSync?: string;
  seriesType: 'standard' | 'daily' | 'anime';
  cleanTitle: string;
  imdbId: string;
  titleSlug: string;
  certification: string;
  genres: string[];
  tags: number[];
  added: string;
  ratings: {
    votes: number;
    value: number;
  };
  qualityProfileId: number;
  id?: number;
  rootFolderPath?: string;
  addOptions?: {
    ignoreEpisodesWithFiles?: boolean;
    ignoreEpisodesWithoutFiles?: boolean;
    searchForMissingEpisodes?: boolean;
  };
  statistics: {
    seasonCount: number;
    episodeFileCount: number;
    episodeCount: number;
    totalEpisodeCount: number;
    sizeOnDisk: number;
    releaseGroups: string[];
    percentOfEpisodes: number;
  };
}

export interface AddSiteOptions {
  tvdbid: number;
  title: string;
  profileId: number;
  seasons: number[];
  seasonFolder: boolean;
  rootFolderPath: string;
  tags?: number[];
  monitored?: boolean;
  monitorNewItems?: WhisparrSite['monitorNewItems'];
  searchNow?: boolean;
}

class WhisparrAPI extends ServarrBase<{
  seriesId: number;
  episodeId: number;
  episode: EpisodeResult;
}> {
  constructor({ url, apiKey }: { url: string; apiKey: string }) {
    super({ url, apiKey, apiName: 'Whisparr', cacheName: 'whisparr' });
  }

  public async getSites(): Promise<WhisparrSite[]> {
    try {
      const response = await this.axios.get<WhisparrSite[]>('/series');

      return response.data;
    } catch (e) {
      throw new Error(`[Whisparr] Failed to retrieve sites: ${e.message}`, {
        cause: e,
      });
    }
  }

  public async getSiteById(id: number): Promise<WhisparrSite> {
    try {
      const response = await this.axios.get<WhisparrSite>(`/series/${id}`);

      return response.data;
    } catch (e) {
      throw new Error(
        `[Whisparr] Failed to retrieve site by ID: ${e.message}`,
        {
          cause: e,
        }
      );
    }
  }

  public async lookupSites(term: string): Promise<WhisparrSite[]> {
    try {
      const response = await this.axios.get<WhisparrSite[]>('/series/lookup', {
        params: {
          term,
        },
      });

      if (!response.data[0]) {
        throw new Error('No sites found');
      }

      return response.data;
    } catch (e) {
      logger.error('Error retrieving sites by title', {
        label: 'Whisparr API',
        errorMessage: e.message,
        term,
      });
      throw new Error('No sites found', { cause: e });
    }
  }

  public async getSiteByTpdbId(id: number): Promise<WhisparrSite> {
    let response: AxiosResponse<WhisparrSite[]>;
    try {
      response = await this.axios.get<WhisparrSite[]>('/series/lookup', {
        params: {
          term: `tvdb:${id}`,
        },
      });
    } catch (e) {
      logger.error('Error retrieving site by TPDB ID', {
        label: 'Whisparr API',
        errorMessage: e.message,
        tpdbId: id,
      });
      throw e;
    }

    if (!response.data[0]) {
      throw new Error('Site not found');
    }

    return response.data[0];
  }

  public async addSite(options: AddSiteOptions): Promise<WhisparrSite> {
    try {
      const site = await this.getSiteByTpdbId(options.tvdbid);

      // If the site already exists, we will simply just update it
      if (site.id) {
        site.monitored = options.monitored ?? site.monitored;
        site.tags = options.tags
          ? Array.from(new Set([...site.tags, ...options.tags]))
          : site.tags;
        site.seasons = this.buildSeasonList(options.seasons, site.seasons);

        const newSiteResponse = await this.axios.put<WhisparrSite>(
          '/series',
          site
        );

        if (newSiteResponse.data.id) {
          logger.info('Updated existing site in Whisparr.', {
            label: 'Whisparr',
            siteId: newSiteResponse.data.id,
            siteTitle: newSiteResponse.data.title,
          });
          logger.debug('Whisparr update details', {
            label: 'Whisparr',
            site: newSiteResponse.data,
          });

          try {
            const episodes = await this.getEpisodes(newSiteResponse.data.id);
            const episodeIdsToMonitor = episodes
              .filter(
                (ep) =>
                  options.seasons.includes(ep.seasonNumber) && !ep.monitored
              )
              .map((ep) => ep.id);

            if (episodeIdsToMonitor.length > 0) {
              logger.debug(
                'Re-monitoring unmonitored episodes for requested seasons.',
                {
                  label: 'Whisparr',
                  siteId: newSiteResponse.data.id,
                  episodeCount: episodeIdsToMonitor.length,
                }
              );
              await this.monitorEpisodes(episodeIdsToMonitor);
            }
          } catch (e) {
            logger.warn('Failed to re-monitor episodes', {
              label: 'Whisparr',
              errorMessage: e.message,
              siteId: newSiteResponse.data.id,
            });
          }

          if (options.searchNow) {
            this.searchSite(newSiteResponse.data.id);
          }

          return newSiteResponse.data;
        } else {
          logger.error('Failed to update site in Whisparr', {
            label: 'Whisparr',
            options,
          });
          throw new Error('Failed to update site in Whisparr');
        }
      }

      const createdSiteResponse = await this.axios.post<WhisparrSite>(
        '/series',
        {
          tvdbId: options.tvdbid,
          title: options.title,
          qualityProfileId: options.profileId,
          seasons: this.buildSeasonList(
            options.seasons,
            site.seasons.map((season) => ({
              seasonNumber: season.seasonNumber,
              // We force all seasons to false if its the first request
              monitored: false,
            }))
          ),
          tags: options.tags,
          seasonFolder: options.seasonFolder,
          monitored: options.monitored,
          monitorNewItems: options.monitorNewItems,
          rootFolderPath: options.rootFolderPath,
          seriesType: 'standard',
          addOptions: {
            ignoreEpisodesWithFiles: true,
            searchForMissingEpisodes: options.searchNow,
          },
        } as Partial<WhisparrSite>
      );

      if (createdSiteResponse.data.id) {
        logger.info('Whisparr accepted request', { label: 'Whisparr' });
        logger.debug('Whisparr add details', {
          label: 'Whisparr',
          site: createdSiteResponse.data,
        });
      } else {
        logger.error('Failed to add site to Whisparr', {
          label: 'Whisparr',
          options,
        });
        throw new Error('Failed to add site to Whisparr');
      }

      return createdSiteResponse.data;
    } catch (e) {
      logger.error('Something went wrong while adding a site to Whisparr.', {
        label: 'Whisparr API',
        errorMessage: e.message,
        options,
        response: e?.response?.data,
      });
      throw new Error('Failed to add site', { cause: e });
    }
  }

  // ponytail: single-scene requests (phase D) compose addSite (seasons monitored:false)
  // + getEpisodes + monitorEpisodes — 3 calls already public above, so no wrapper method.
  // Promote to a real addSiteWithEpisodeMonitoring() only if that composition grows a
  // 4th step (e.g. a dedicated single-episode endpoint) or gets duplicated by a second caller.

  public async searchSite(seriesId: number): Promise<void> {
    logger.info('Executing site search command.', {
      label: 'Whisparr API',
      seriesId,
    });

    try {
      await this.runCommand('MissingEpisodeSearch', { seriesId });
    } catch (e) {
      logger.error(
        'Something went wrong while executing Whisparr missing episode search.',
        {
          label: 'Whisparr API',
          errorMessage: e.message,
          seriesId,
        }
      );
    }
  }

  public async getEpisodes(seriesId: number): Promise<EpisodeResult[]> {
    try {
      const response = await this.axios.get<EpisodeResult[]>('/episode', {
        params: { seriesId },
      });
      return response.data;
    } catch (e) {
      logger.error('Failed to retrieve episodes', {
        label: 'Whisparr API',
        errorMessage: e.message,
        seriesId,
      });
      throw new Error('Failed to get episodes', { cause: e });
    }
  }

  public async monitorEpisodes(episodeIds: number[]): Promise<void> {
    try {
      await this.axios.put('/episode/monitor', {
        episodeIds,
        monitored: true,
      });
    } catch (e) {
      logger.error('Failed to monitor episodes', {
        label: 'Whisparr API',
        errorMessage: e.message,
        episodeIds,
      });
      throw new Error('Failed to monitor episodes', { cause: e });
    }
  }

  private buildSeasonList(
    seasons: number[],
    existingSeasons?: WhisparrSeason[]
  ): WhisparrSeason[] {
    if (existingSeasons) {
      const newSeasons = existingSeasons.map((season) => {
        if (seasons.includes(season.seasonNumber)) {
          season.monitored = true;
        }
        return season;
      });

      return newSeasons;
    }

    const newSeasons = seasons.map(
      (seasonNumber): WhisparrSeason => ({
        seasonNumber,
        monitored: true,
      })
    );

    return newSeasons;
  }
  public removeSite = async (tvdbId: number): Promise<void> => {
    const { id, title } = await this.getSiteByTpdbId(tvdbId);

    if (!id) {
      logger.info(`[Whisparr] Site not in library, nothing to remove`, {
        tvdbId,
      });
      return;
    }

    try {
      await this.axios.delete(`/series/${id}`, {
        params: {
          deleteFiles: true,
          addImportExclusion: false,
        },
      });
      logger.info(`[Whisparr] Removed site ${title}`);
    } catch (e) {
      if (e?.response?.status === 404) {
        logger.info(`[Whisparr] Site already removed from Whisparr`, {
          tvdbId,
        });
        return;
      }
      throw e;
    }
  };

  public clearCache = ({
    tvdbId,
    externalId,
    title,
  }: {
    tvdbId?: number | null;
    externalId?: number | null;
    title?: string | null;
  }) => {
    if (tvdbId) {
      this.removeCache('/series/lookup', {
        term: `tvdb:${tvdbId}`,
      });
    }
    if (externalId) {
      this.removeCache(`/series/${externalId}`);
    }
    if (title) {
      this.removeCache('/series/lookup', {
        term: title,
      });
    }
  };
}

export default WhisparrAPI;
