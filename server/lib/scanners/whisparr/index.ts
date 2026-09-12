import type { EpisodeResult, WhisparrSite } from '@server/api/servarr/whisparr';
import WhisparrAPI from '@server/api/servarr/whisparr';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import Season from '@server/entity/Season';
import type {
  RunnableScanner,
  StatusBase,
} from '@server/lib/scanners/baseScanner';
import BaseScanner from '@server/lib/scanners/baseScanner';
import type { PathLookup } from '@server/lib/scanners/library';
import { jellyfinLookup, stashLookup } from '@server/lib/scanners/library';
import { getSettings } from '@server/lib/settings';
import { In } from 'typeorm';

// Whisparr is the single source of truth for what is being tracked (sites =
// series, seasons = years, scenes = episodes, PLAN.md D2). A scene only becomes
// AVAILABLE when an enabled library (Stash/Jellyfin) has its file (D3/DoD 6);
// Whisparr having the file on disk is PROCESSING until then.

type SyncStatus = StatusBase & { libraries: string[] };

interface YearTally {
  total: number;
  monitored: boolean;
  files: number;
  available: number;
}

// Scene/site rows have no TMDB identity; the column is NOT NULL so 0 is the
// placeholder. Lookups for these types go through tpdbId.
const NO_TMDB_ID = 0;

const preserveOrUnknown = (previous?: MediaStatus): MediaStatus =>
  previous === MediaStatus.DELETED ? MediaStatus.DELETED : MediaStatus.UNKNOWN;

class WhisparrScanner
  extends BaseScanner<WhisparrSite>
  implements RunnableScanner<SyncStatus>
{
  private api: WhisparrAPI;
  private lookups: PathLookup[] = [];
  private scannedSiteIds = new Set<string>();
  private scannedSceneIds = new Set<string>();

  constructor() {
    super('Whisparr Scan', { bundleSize: 50 });
  }

  public status(): SyncStatus {
    return {
      running: this.running,
      progress: this.progress,
      total: this.items.length,
      libraries: this.lookups.map((l) => l.name),
    };
  }

  public async run(): Promise<void> {
    const { whisparr } = getSettings();
    if (!whisparr.enabled || !whisparr.apiKey || !whisparr.hostname) {
      this.log('Whisparr is not configured. Skipping scan.', 'info');
      return;
    }

    const sessionId = this.startRun();
    this.scannedSiteIds.clear();
    this.scannedSceneIds.clear();

    try {
      this.api = new WhisparrAPI({
        apiKey: whisparr.apiKey,
        url: WhisparrAPI.buildUrl(whisparr, '/api/v3'),
      });
      this.lookups = (
        await Promise.all([stashLookup(), jellyfinLookup()])
      ).filter((l): l is PathLookup => l !== null);
      this.log(
        `Libraries used for availability: ${
          this.lookups.map((l) => l.name).join(', ') || 'none'
        }`,
        'info'
      );

      this.items = await this.api.getSites();
      await this.loop(this.processSite.bind(this), { sessionId });

      if (this.items.length === 0) {
        this.log('Whisparr returned no sites. Orphan cleanup skipped.', 'warn');
      } else {
        await this.cleanupOrphans();
      }
      this.log('Whisparr scan complete', 'info');
    } catch (e) {
      this.log('Scan interrupted', 'error', { errorMessage: e.message });
    } finally {
      this.endRun(sessionId);
    }
  }

  private async inLibrary(path: string): Promise<boolean> {
    for (const lookup of this.lookups) {
      if (await lookup.has(path)) {
        return true;
      }
    }
    return false;
  }

  private async processSite(site: WhisparrSite): Promise<void> {
    const siteTpdbId = String(site.tvdbId);
    this.scannedSiteIds.add(siteTpdbId);

    try {
      if (!site.id) {
        throw new Error('Site has no Whisparr id');
      }
      const episodes = await this.api.getEpisodes(site.id, {
        includeEpisodeFile: true,
      });

      const years = new Map<number, YearTally>();
      for (const season of site.seasons) {
        years.set(season.seasonNumber, {
          total: season.statistics?.totalEpisodeCount ?? 0,
          monitored: season.monitored,
          files: 0,
          available: 0,
        });
      }

      const sceneRepository = getRepository(Media);
      const existingScenes = await sceneRepository.find({
        where: {
          mediaType: MediaType.SCENE,
          tpdbId: In(episodes.map((ep) => String(ep.tvdbId))),
        },
      });

      // ponytail: one library round-trip per file, sequential. Batch per site
      // if a Stash with tens of thousands of scenes makes the nightly run crawl.
      for (const episode of episodes) {
        const tally = years.get(episode.seasonNumber) ?? {
          total: 0,
          monitored: false,
          files: 0,
          available: 0,
        };
        years.set(episode.seasonNumber, tally);

        const path = episode.hasFile ? episode.episodeFile?.path : undefined;
        const available = path ? await this.inLibrary(path) : false;
        if (episode.hasFile) {
          tally.files += 1;
        }
        if (available) {
          tally.available += 1;
        }

        await this.processScene(
          episode,
          available,
          existingScenes.find((m) => m.tpdbId === String(episode.tvdbId))
        );
      }

      await this.processSiteMedia(site, years);
    } catch (e) {
      this.log('Failed to process Whisparr site', 'error', {
        errorMessage: e.message,
        title: site.title,
      });
    }
  }

  private async processScene(
    episode: EpisodeResult,
    available: boolean,
    existing?: Media
  ): Promise<void> {
    const tpdbId = String(episode.tvdbId);
    this.scannedSceneIds.add(tpdbId);

    const status = available
      ? MediaStatus.AVAILABLE
      : episode.hasFile || episode.monitored
        ? MediaStatus.PROCESSING
        : preserveOrUnknown(existing?.status);

    await this.asyncLock.dispatch(`scene:${tpdbId}`, async () => {
      const mediaRepository = getRepository(Media);

      if (existing) {
        if (
          existing.status === status &&
          existing.externalServiceId === episode.id
        ) {
          return;
        }
        existing.status = status;
        existing.externalServiceId = episode.id;
        await mediaRepository.save(existing);
        this.log(`Updated scene ${episode.title} (${tpdbId}) -> ${status}`);
        return;
      }

      // ponytail: only file-bearing scenes get a row. Monitored-without-file
      // would mean one row per episode of every tracked site; requested scenes
      // already have a row from the request itself.
      if (!episode.hasFile) {
        return;
      }

      await mediaRepository.save(
        new Media({
          mediaType: MediaType.SCENE,
          tmdbId: NO_TMDB_ID,
          tpdbId,
          status,
          status4k: MediaStatus.UNKNOWN,
          externalServiceId: episode.id,
        })
      );
      this.log(`Saved new scene ${episode.title} (${tpdbId}) -> ${status}`);
    });
  }

  private async processSiteMedia(
    site: WhisparrSite,
    years: Map<number, YearTally>
  ): Promise<void> {
    const tpdbId = String(site.tvdbId);

    await this.asyncLock.dispatch(`site:${tpdbId}`, async () => {
      const mediaRepository = getRepository(Media);
      const media =
        (await mediaRepository.findOne({
          where: { mediaType: MediaType.SITE, tpdbId },
        })) ??
        new Media({
          mediaType: MediaType.SITE,
          tmdbId: NO_TMDB_ID,
          tpdbId,
          seasons: [],
          status: MediaStatus.UNKNOWN,
          status4k: MediaStatus.UNKNOWN,
        });

      const availableBefore = media.seasons.filter(
        (s) => s.status === MediaStatus.AVAILABLE
      ).length;

      for (const [year, tally] of years) {
        const season =
          media.seasons.find((s) => s.seasonNumber === year) ??
          (() => {
            const created = new Season({
              seasonNumber: year,
              status: MediaStatus.UNKNOWN,
              status4k: MediaStatus.UNKNOWN,
            });
            media.seasons.push(created);
            return created;
          })();

        season.status =
          tally.total > 0 && tally.available === tally.total
            ? MediaStatus.AVAILABLE
            : tally.available > 0
              ? MediaStatus.PARTIALLY_AVAILABLE
              : tally.monitored || tally.files > 0
                ? MediaStatus.PROCESSING
                : preserveOrUnknown(season.status);
      }

      const counted = media.seasons.filter(
        (s) => (years.get(s.seasonNumber)?.total ?? 0) > 0
      );
      media.status =
        counted.length > 0 &&
        counted.every((s) => s.status === MediaStatus.AVAILABLE)
          ? MediaStatus.AVAILABLE
          : media.seasons.some(
                (s) =>
                  s.status === MediaStatus.AVAILABLE ||
                  s.status === MediaStatus.PARTIALLY_AVAILABLE
              )
            ? MediaStatus.PARTIALLY_AVAILABLE
            : media.seasons.some((s) => s.status === MediaStatus.PROCESSING)
              ? MediaStatus.PROCESSING
              : preserveOrUnknown(media.status);

      const availableAfter = media.seasons.filter(
        (s) => s.status === MediaStatus.AVAILABLE
      ).length;
      if (availableAfter > availableBefore) {
        media.lastSeasonChange = new Date();
      }

      media.externalServiceId = site.id;
      media.externalServiceSlug = site.titleSlug;

      await mediaRepository.save(media);
      this.log(`Processed site ${site.title} (${tpdbId}) -> ${media.status}`);
    });
  }

  private async cleanupOrphans(): Promise<void> {
    const mediaRepository = getRepository(Media);

    const processing = await mediaRepository.find({
      where: {
        mediaType: In([MediaType.SITE, MediaType.SCENE]),
        status: MediaStatus.PROCESSING,
      },
      relations: { seasons: true, requests: true },
    });

    for (const media of processing) {
      const seen =
        media.mediaType === MediaType.SITE
          ? this.scannedSiteIds
          : this.scannedSceneIds;
      if (!media.tpdbId || seen.has(media.tpdbId)) {
        continue;
      }

      media.status = MediaStatus.UNKNOWN;
      for (const season of media.seasons) {
        if (season.status === MediaStatus.PROCESSING) {
          season.status = MediaStatus.UNKNOWN;
        }
      }
      await mediaRepository.save(media);
      await this.declineOrphanedRequests(media, false);
      this.log(
        `${media.mediaType} ${media.tpdbId} not found in Whisparr. Status reset to UNKNOWN.`,
        'info'
      );
    }
  }
}

export const whisparrScanner = new WhisparrScanner();
