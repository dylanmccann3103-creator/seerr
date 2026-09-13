import {
  MediaRequestStatus,
  MediaStatus,
  isSeasonal,
  isSingleItem,
} from '@server/constants/media';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import Season from '@server/entity/Season';
import SeasonRequest from '@server/entity/SeasonRequest';
import logger from '@server/logger';
import { withNestedTransaction } from '@server/utils/nestedTransaction';
import type {
  EntityManager,
  EntitySubscriberInterface,
  UpdateEvent,
} from 'typeorm';
import { EventSubscriber, In } from 'typeorm';

@EventSubscriber()
export class MediaSubscriber implements EntitySubscriberInterface<Media> {
  private async updateChildRequestStatus(manager: EntityManager, event: Media) {
    const requestRepository = manager.getRepository(MediaRequest);

    const requests = await requestRepository.find({
      where: { media: { id: event.id } },
    });

    for (const request of requests) {
      if (request.status === MediaRequestStatus.PENDING) {
        request.status = MediaRequestStatus.APPROVED;
        await requestRepository.save(request);
      }
    }
  }

  private async updateRelatedMediaRequest(
    manager: EntityManager,
    event: Media,
    databaseEvent: Media
  ) {
    const requestRepository = manager.getRepository(MediaRequest);
    const seasonRequestRepository = manager.getRepository(SeasonRequest);

    const relatedRequests = await requestRepository.find({
      relations: {
        media: true,
      },
      where: {
        media: { id: event.id },
        status: In([MediaRequestStatus.APPROVED, MediaRequestStatus.FAILED]),
      },
    });

    // Check the media entity status and if available
    // or deleted, set the related request to completed
    if (relatedRequests.length > 0) {
      const completedRequests: MediaRequest[] = [];

      for (const request of relatedRequests) {
        let shouldComplete = false;

        if (
          (event.status === MediaStatus.AVAILABLE ||
            event.status === MediaStatus.DELETED) &&
          isSingleItem(event.mediaType)
        ) {
          shouldComplete = true;
        } else if (isSeasonal(event.mediaType)) {
          const allSeasonResults: boolean[] = [];

          // Sequential on purpose as these saves share the transaction's connection
          for (const requestSeason of request.seasons) {
            const matchingSeason = event.seasons.find(
              (mediaSeason) =>
                mediaSeason.seasonNumber === requestSeason.seasonNumber
            );
            const matchingOldSeason = databaseEvent.seasons.find(
              (oldSeason) =>
                oldSeason.seasonNumber === requestSeason.seasonNumber
            );

            if (!matchingSeason) {
              allSeasonResults.push(false);
              continue;
            }

            const currentSeasonStatus = matchingSeason.status;
            const previousSeasonStatus = matchingOldSeason?.status;

            const hasStatusChanged =
              currentSeasonStatus !== previousSeasonStatus;

            const shouldUpdate =
              (hasStatusChanged ||
                requestSeason.status === MediaRequestStatus.COMPLETED) &&
              (currentSeasonStatus === MediaStatus.AVAILABLE ||
                currentSeasonStatus === MediaStatus.DELETED);

            if (shouldUpdate) {
              requestSeason.status = MediaRequestStatus.COMPLETED;
              await seasonRequestRepository.save(requestSeason);

              allSeasonResults.push(true);
              continue;
            }

            allSeasonResults.push(false);
          }

          const allSeasonsReady = allSeasonResults.every((result) => result);
          shouldComplete = allSeasonsReady;
        }

        if (shouldComplete) {
          request.status = MediaRequestStatus.COMPLETED;
          completedRequests.push(request);
        }
      }

      await requestRepository.save(completedRequests);
    }
  }

  public async beforeUpdate(event: UpdateEvent<Media>): Promise<void> {
    if (!event.entity || !event.databaseEntity) {
      return;
    }

    try {
      if (
        event.entity.status === MediaStatus.AVAILABLE &&
        event.databaseEntity?.status === MediaStatus.PENDING
      ) {
        await withNestedTransaction(event.manager, async (manager) => {
          await this.updateChildRequestStatus(manager, event.entity as Media);
        });
      }
    } catch (e) {
      logger.error(
        'Error while updating child request status in beforeUpdate subscriber',
        {
          label: 'Media',
          mediaId: event.entity.id,
          errorMessage: e instanceof Error ? e.message : String(e),
        }
      );
    }

    // Manually load related seasons into databaseEntity
    // for the season status comparison in afterUpdate
    const seasons = await event.manager
      .getRepository(Season)
      .createQueryBuilder('season')
      .leftJoin('season.media', 'media')
      .where('media.id = :id', { id: event.databaseEntity.id })
      .getMany();

    event.databaseEntity.seasons = seasons;
  }

  public async afterUpdate(event: UpdateEvent<Media>): Promise<void> {
    if (!event.entity || !event.databaseEntity) {
      return;
    }

    const validStatuses = [
      MediaStatus.PARTIALLY_AVAILABLE,
      MediaStatus.AVAILABLE,
      MediaStatus.DELETED,
    ];

    const seasonStatusChanged = event.entity?.seasons?.some(
      (season: Season, index: number) =>
        season.status !== event.databaseEntity.seasons[index]?.status
    );

    try {
      if (
        (event.entity.status !== event.databaseEntity?.status ||
          (isSeasonal(event.entity.mediaType) && seasonStatusChanged)) &&
        validStatuses.includes(event.entity.status)
      ) {
        await withNestedTransaction(event.manager, async (manager) => {
          await this.updateRelatedMediaRequest(
            manager,
            event.entity as Media,
            event.databaseEntity as Media
          );
        });
      }
    } catch (e) {
      logger.error(
        'Error while updating related requests in afterUpdate subscriber',
        {
          label: 'Media',
          mediaId: event.entity.id,
          errorMessage: e instanceof Error ? e.message : String(e),
        }
      );
    }
  }

  public listenTo(): typeof Media {
    return Media;
  }
}
