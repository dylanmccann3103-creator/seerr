import type { EpisodeResult } from '@server/api/servarr/whisparr';
import WhisparrAPI from '@server/api/servarr/whisparr';
import Tpdb from '@server/api/tpdb';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
  isSeasonal,
  isSingleItem,
  isWhisparrType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import Season from '@server/entity/Season';
import SeasonRequest from '@server/entity/SeasonRequest';
import notificationManager, { Notification } from '@server/lib/notifications';
import { getSettings } from '@server/lib/settings';
import { tpdbTitle } from '@server/lib/tpdbTitle';
import logger from '@server/logger';
import { withNestedTransaction } from '@server/utils/nestedTransaction';
import { truncate } from 'lodash';
import type {
  EntityManager,
  EntitySubscriberInterface,
  InsertEvent,
  RemoveEvent,
  UpdateEvent,
} from 'typeorm';
import { EventSubscriber, Not } from 'typeorm';

const sanitizeDisplayName = (displayName: string): string => {
  return displayName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/gi, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

// ponytail: Whisparr fills a new site's episodes asynchronously after POST
// /series, so a scene dispatch polls briefly for its episode. Exported so
// tests can shrink the delay.
export const whisparrEpisodePoll = { attempts: 5, delayMs: 2000 };

@EventSubscriber()
export class MediaRequestSubscriber implements EntitySubscriberInterface<MediaRequest> {
  // PLAN.md D2t/D5: awaited dispatch, exactly-once via an atomic conditional
  // UPDATE on sentToServiceAt (no in-process lock — a subscriber holds the
  // save's connection, see utils/requestLock.ts). Failure -> FAILED +
  // failureReason and the guard is cleared so /retry can resend. Nothing is
  // ever deleted here.
  public async sendToWhisparr(
    entity: MediaRequest,
    manager: EntityManager
  ): Promise<void> {
    if (
      entity.status !== MediaRequestStatus.APPROVED ||
      !isWhisparrType(entity.type)
    ) {
      return;
    }

    const requestRepository = manager.getRepository(MediaRequest);
    const mediaRepository = manager.getRepository(Media);
    const settings = getSettings().whisparr;
    const log = {
      label: 'Media Request',
      requestId: entity.id,
      mediaId: entity.media.id,
    };

    if (!settings.enabled || !settings.apiKey || !settings.hostname) {
      logger.warn(
        'Whisparr is not configured, skipping request processing',
        log
      );
      return;
    }

    // Plain query-builder updates: listeners off so these bookkeeping writes
    // don't re-enter this subscriber with a partial entity.
    const claimed = await requestRepository
      .createQueryBuilder()
      .update(MediaRequest)
      .set({ sentToServiceAt: new Date() })
      .where('id = :id AND sentToServiceAt IS NULL', { id: entity.id })
      .callListeners(false)
      .execute();
    const silentUpdate = async (
      target: typeof Media | typeof MediaRequest,
      id: number,
      values: Record<string, unknown>
    ) =>
      manager
        .createQueryBuilder()
        .update(target)
        .set(values)
        .where('id = :id', { id })
        .callListeners(false)
        .execute();

    if (!claimed.affected) {
      logger.debug('Request already dispatched to Whisparr, skipping', log);
      return;
    }
    entity.sentToServiceAt = new Date();

    const media = await mediaRepository.findOne({
      where: { id: entity.media.id },
    });

    try {
      if (!media) {
        throw new Error('Media data not found');
      }

      if (media.status === MediaStatus.AVAILABLE) {
        logger.warn('Media already exists, marking request as COMPLETED', log);
        entity.status = MediaRequestStatus.COMPLETED;
        entity.seasons.forEach((season) => {
          season.status = MediaRequestStatus.COMPLETED;
        });
        await requestRepository.save(entity);
        return;
      }

      if (!media.tpdbId) {
        throw new Error('Media has no TPDB id');
      }

      const whisparr = new WhisparrAPI({
        apiKey: settings.apiKey,
        url: WhisparrAPI.buildUrl(settings, '/api/v3'),
      });

      const rootFolderPath = entity.rootFolder || settings.activeDirectory;
      const profileId = entity.profileId || settings.activeProfileId;
      const tags = entity.tags ? [...entity.tags] : [];

      if (settings.tagRequests) {
        const label = `${entity.requestedBy.id}-${sanitizeDisplayName(
          entity.requestedBy.displayName
        )}`;
        const existingTags = await whisparr.getTags();
        const userTag =
          existingTags.find(
            (t) =>
              t.label.startsWith(`${entity.requestedBy.id}-`) ||
              t.label.startsWith(`${entity.requestedBy.id} - `)
          ) ?? (await whisparr.createTag({ label }));
        if (userTag.id && !tags.includes(userTag.id)) {
          tags.push(userTag.id);
        }
      }

      const common = {
        profileId,
        rootFolderPath,
        tags,
        seasonFolder: true,
        monitored: true,
        monitorNewItems: settings.monitorNewItems,
      };

      if (entity.type === MediaType.SITE) {
        const site = await whisparr.addSite({
          ...common,
          tvdbid: Number(media.tpdbId),
          seasons: entity.seasons.map((season) => season.seasonNumber),
          searchNow: settings.searchOnRequest,
        });
        await silentUpdate(Media, media.id, {
          externalServiceId: site.id,
          externalServiceSlug: site.titleSlug,
        });
      } else {
        const scene = await new Tpdb().getScene({ sceneId: media.tpdbId });
        const site = await whisparr.addSite({
          ...common,
          tvdbid: scene.site_id,
          seasons: [],
          searchNow: false,
        });
        if (!site.id) {
          throw new Error('Whisparr returned a site without an id');
        }
        const episode = await this.findWhisparrEpisode(
          whisparr,
          site.id,
          Number(media.tpdbId)
        );
        await whisparr.monitorEpisodes([episode.id]);
        if (settings.searchOnRequest) {
          await whisparr.searchEpisodes([episode.id]);
        }
        await silentUpdate(Media, media.id, {
          externalServiceId: episode.id,
          externalServiceSlug: site.titleSlug,
        });
      }

      logger.info('Sent request to Whisparr', log);
    } catch (e) {
      const failureReason = truncate(
        e instanceof Error ? e.message : String(e),
        { length: 255 }
      );
      entity.status = MediaRequestStatus.FAILED;
      entity.failureReason = failureReason;
      entity.sentToServiceAt = null;
      await silentUpdate(MediaRequest, entity.id, {
        status: MediaRequestStatus.FAILED,
        failureReason,
        sentToServiceAt: null,
      });
      logger.warn(
        'Failed to send request to Whisparr, marking status as FAILED',
        { ...log, errorMessage: failureReason }
      );
      if (media) {
        MediaRequest.sendNotification(entity, media, Notification.MEDIA_FAILED);
      }
    }
  }

  private async findWhisparrEpisode(
    whisparr: WhisparrAPI,
    siteId: number,
    sceneId: number
  ): Promise<EpisodeResult> {
    for (let attempt = 0; attempt < whisparrEpisodePoll.attempts; attempt++) {
      const episode = (await whisparr.getEpisodes(siteId)).find(
        (ep) => ep.tvdbId === sceneId
      );
      if (episode) {
        return episode;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, whisparrEpisodePoll.delayMs)
      );
    }
    throw new Error(
      `Scene ${sceneId} not found in Whisparr site ${siteId} (episodes not indexed yet?)`
    );
  }

  private async notifyAvailableMovie(
    entity: MediaRequest,
    event?: UpdateEvent<MediaRequest>
  ) {
    // Get fresh media state using event manager
    let latestMedia: Media | null = null;
    if (event?.manager) {
      latestMedia = await event.manager.findOne(Media, {
        where: { id: entity.media.id },
      });
    }
    if (!latestMedia) {
      const mediaRepository = getRepository(Media);
      latestMedia = await mediaRepository.findOne({
        where: { id: entity.media.id },
      });
    }

    // Check availability using fresh media state
    if (!latestMedia || latestMedia.status !== MediaStatus.AVAILABLE) {
      return;
    }

    try {
      const { subject, overview, image } = await tpdbTitle(latestMedia);

      notificationManager.sendNotification(Notification.MEDIA_AVAILABLE, {
        event: 'Scene Request Now Available',
        notifyAdmin: false,
        notifySystem: true,
        notifyUser: entity.requestedBy,
        subject,
        message: truncate(overview ?? '', {
          length: 500,
          separator: /\s/,
          omission: '…',
        }),
        media: latestMedia,
        image,
        request: entity,
      });
    } catch (e) {
      logger.error('Something went wrong sending media notification(s)', {
        label: 'Notifications',
        errorMessage: e.message,
        mediaId: entity.id,
      });
    }
  }

  private async notifyAvailableSeries(
    entity: MediaRequest,
    event?: UpdateEvent<MediaRequest>
  ) {
    // Get fresh media state with seasons using event manager
    let latestMedia: Media | null = null;
    if (event?.manager) {
      latestMedia = await event.manager.findOne(Media, {
        where: { id: entity.media.id },
        relations: { seasons: true },
      });
    }
    if (!latestMedia) {
      const mediaRepository = getRepository(Media);
      latestMedia = await mediaRepository.findOne({
        where: { id: entity.media.id },
        relations: { seasons: true },
      });
    }

    if (!latestMedia) {
      return;
    }

    // Check availability using fresh media state
    const requestedSeasons =
      entity.seasons?.map((entitySeason) => entitySeason.seasonNumber) ?? [];
    const availableSeasons = latestMedia.seasons.filter(
      (season) =>
        season.status === MediaStatus.AVAILABLE &&
        requestedSeasons.includes(season.seasonNumber)
    );
    const isMediaAvailable =
      availableSeasons.length > 0 &&
      availableSeasons.length === requestedSeasons.length;

    if (!isMediaAvailable) {
      return;
    }

    try {
      const { subject, overview, image } = await tpdbTitle(latestMedia);

      notificationManager.sendNotification(Notification.MEDIA_AVAILABLE, {
        event: 'Site Request Now Available',
        subject,
        message: truncate(overview ?? '', {
          length: 500,
          separator: /\s/,
          omission: '…',
        }),
        notifyAdmin: false,
        notifySystem: true,
        notifyUser: entity.requestedBy,
        image,
        media: latestMedia,
        extra: [
          {
            name: 'Requested Years',
            value: entity.seasons
              .map((season) => season.seasonNumber)
              .join(', '),
          },
        ],
        request: entity,
      });
    } catch (e) {
      logger.error('Something went wrong sending media notification(s)', {
        label: 'Notifications',
        errorMessage: e.message,
        mediaId: entity.id,
      });
    }
  }

  public async updateParentStatus(
    manager: EntityManager,
    entity: MediaRequest
  ): Promise<void> {
    const mediaRepository = manager.getRepository(Media);
    const media = await mediaRepository.findOne({
      where: { id: entity.media.id },
    });
    if (!media) {
      logger.error('Media data not found', {
        label: 'Media Request',
        requestId: entity.id,
        mediaId: entity.media.id,
      });
      return;
    }

    const statusKey = 'status';
    const seasonRequestRepository = manager.getRepository(SeasonRequest);
    const requestRepository = manager.getRepository(MediaRequest);

    if (
      entity.status === MediaRequestStatus.APPROVED &&
      // Do not update the status if the item is already partially available or available
      media.status !== MediaStatus.AVAILABLE &&
      media.status !== MediaStatus.PARTIALLY_AVAILABLE &&
      media.status !== MediaStatus.PROCESSING
    ) {
      media.status = MediaStatus.PROCESSING;
      await mediaRepository.save(media);
    }

    if (
      isSingleItem(media.mediaType) &&
      entity.status === MediaRequestStatus.DECLINED &&
      media.status !== MediaStatus.DELETED
    ) {
      media.status = MediaStatus.UNKNOWN;
      await mediaRepository.save(media);
    }

    /**
     * If the media type is TV, and we are declining a request,
     * we must check if its the only pending request and that
     * there the current media status is just pending (meaning no
     * other requests have yet to be approved)
     */
    if (
      isSeasonal(media.mediaType) &&
      entity.status === MediaRequestStatus.DECLINED &&
      media.status === MediaStatus.PENDING
    ) {
      const pendingCount = await requestRepository.count({
        where: {
          media: { id: media.id },
          status: MediaRequestStatus.PENDING,
          id: Not(entity.id),
        },
      });

      if (pendingCount === 0) {
        // Re-fetch media without requests to avoid cascade issues
        const freshMedia = await mediaRepository.findOne({
          where: { id: media.id },
        });
        if (freshMedia) {
          freshMedia[statusKey] = MediaStatus.UNKNOWN;
          await mediaRepository.save(freshMedia);
        }
      }
    }

    // Reset season statuses when a TV request is declined
    if (
      isSeasonal(media.mediaType) &&
      entity.status === MediaRequestStatus.DECLINED
    ) {
      const seasonRepository = manager.getRepository(Season);
      const actualSeasons = await seasonRepository.find({
        where: { media: { id: media.id } },
      });

      for (const seasonRequest of entity.seasons) {
        seasonRequest.status = MediaRequestStatus.DECLINED;
        await seasonRequestRepository.save(seasonRequest);

        const season = actualSeasons.find(
          (s) => s.seasonNumber === seasonRequest.seasonNumber
        );

        if (season && season.status === MediaStatus.PENDING) {
          const otherActiveRequests = await requestRepository
            .createQueryBuilder('request')
            .leftJoinAndSelect('request.seasons', 'season')
            .where('request.mediaId = :mediaId', { mediaId: media.id })
            .andWhere('request.id != :requestId', { requestId: entity.id })
            .andWhere('request.status NOT IN (:...statuses)', {
              statuses: [
                MediaRequestStatus.DECLINED,
                MediaRequestStatus.COMPLETED,
              ],
            })
            .andWhere('season.seasonNumber = :seasonNumber', {
              seasonNumber: season.seasonNumber,
            })
            .getCount();

          if (otherActiveRequests === 0) {
            season.status = MediaStatus.UNKNOWN;
            await seasonRepository.save(season);
          }
        }
      }
    }

    // Approve child seasons if parent is approved
    if (
      isSeasonal(media.mediaType) &&
      entity.status === MediaRequestStatus.APPROVED
    ) {
      for (const season of entity.seasons) {
        season.status = MediaRequestStatus.APPROVED;
        await seasonRequestRepository.save(season);
      }
    }
  }

  public async handleRemoveParentUpdate(
    manager: EntityManager,
    entity: MediaRequest
  ): Promise<void> {
    const fullMedia = await manager.findOneOrFail(Media, {
      where: { id: entity.media.id },
      relations: { requests: { seasons: true }, seasons: true },
    });

    const hasActive = fullMedia.requests.some(
      (request) =>
        request.status !== MediaRequestStatus.COMPLETED &&
        request.status !== MediaRequestStatus.DECLINED
    );

    const needsStatusUpdate =
      !hasActive &&
      fullMedia.status !== MediaStatus.AVAILABLE &&
      fullMedia.status !== MediaStatus.PARTIALLY_AVAILABLE;

    if (needsStatusUpdate) {
      // Re-fetch WITHOUT requests to avoid cascade issues on save
      const cleanMedia = await manager.findOneOrFail(Media, {
        where: { id: entity.media.id },
      });

      const hadCompleted = fullMedia.requests.some(
        (r) => r.status === MediaRequestStatus.COMPLETED
      );
      cleanMedia.status = hadCompleted
        ? MediaStatus.DELETED
        : MediaStatus.UNKNOWN;

      await manager.save(cleanMedia);
    }

    // Reset stale seasons or re-requests fail ("No seasons available to request")
    if (isSeasonal(fullMedia.mediaType)) {
      const removedSeasonNumbers = new Set(
        entity.seasons.map((s) => s.seasonNumber)
      );
      const activeSeasonNumbers = new Set(
        fullMedia.requests
          .filter(
            (request) =>
              request.status !== MediaRequestStatus.COMPLETED &&
              request.status !== MediaRequestStatus.DECLINED
          )
          .flatMap((request) => request.seasons.map((s) => s.seasonNumber))
      );

      const changedSeasons: Season[] = [];
      for (const season of fullMedia.seasons) {
        if (
          (season.status === MediaStatus.PENDING ||
            season.status === MediaStatus.PROCESSING) &&
          removedSeasonNumbers.has(season.seasonNumber) &&
          !activeSeasonNumbers.has(season.seasonNumber)
        ) {
          season.status = MediaStatus.UNKNOWN;
          changedSeasons.push(season);
        }
      }
      if (changedSeasons.length) {
        await manager.save(changedSeasons);
      }
    }
  }

  public async afterUpdate(event: UpdateEvent<MediaRequest>): Promise<void> {
    if (!event.entity) {
      return;
    }

    try {
      await this.sendToWhisparr(event.entity as MediaRequest, event.manager);
    } catch (e) {
      logger.error('Error while sending to *arr in afterUpdate subscriber', {
        label: 'Media Request',
        requestId: (event.entity as MediaRequest).id,
        errorMessage: e instanceof Error ? e.message : String(e),
      });
    }

    try {
      await withNestedTransaction(event.manager, async (manager) => {
        await this.updateParentStatus(manager, event.entity as MediaRequest);
      });

      if (event.entity.status === MediaRequestStatus.COMPLETED) {
        if (isSingleItem(event.entity.media.mediaType)) {
          await this.notifyAvailableMovie(event.entity as MediaRequest, event);
        }
        if (isSeasonal(event.entity.media.mediaType)) {
          await this.notifyAvailableSeries(event.entity as MediaRequest, event);
        }
      }
    } catch (e) {
      logger.error(
        'Error while updating parent status in afterUpdate subscriber',
        {
          label: 'Media Request',
          requestId: (event.entity as MediaRequest).id,
          errorMessage: e instanceof Error ? e.message : String(e),
        }
      );
    }
  }

  public async afterInsert(event: InsertEvent<MediaRequest>): Promise<void> {
    if (!event.entity) {
      return;
    }

    try {
      await this.sendToWhisparr(event.entity as MediaRequest, event.manager);
    } catch (e) {
      logger.error('Error while sending to *arr in afterInsert subscriber', {
        label: 'Media Request',
        requestId: (event.entity as MediaRequest).id,
        errorMessage: e instanceof Error ? e.message : String(e),
      });
    }

    try {
      await withNestedTransaction(event.manager, async (manager) => {
        await this.updateParentStatus(manager, event.entity as MediaRequest);
      });
    } catch (e) {
      logger.error(
        'Error while updating parent status in afterInsert subscriber',
        {
          label: 'Media Request',
          requestId: (event.entity as MediaRequest).id,
          errorMessage: e instanceof Error ? e.message : String(e),
        }
      );
    }
  }

  public async afterRemove(event: RemoveEvent<MediaRequest>): Promise<void> {
    if (!event.entity) {
      return;
    }

    await this.handleRemoveParentUpdate(
      event.manager as EntityManager,
      event.entity as MediaRequest
    );
  }

  public listenTo(): typeof MediaRequest {
    return MediaRequest;
  }
}
