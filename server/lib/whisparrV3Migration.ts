import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { getSettings } from '@server/lib/settings';
import { sendSceneToWhisparrV3 } from '@server/lib/whisparrV3';
import logger from '@server/logger';
import { truncate } from 'lodash';
import { In } from 'typeorm';

export interface WhisparrV3MigrationSummary {
  added: number;
  skipped: number;
  notFound: number;
  failed: number;
}

const NOT_FOUND_REASON = 'Niet gevonden op StashDB';

// Admin-triggered, one-shot: walk every scene request that isn't DECLINED or
// COMPLETED, resolve it to a StashDB id and add it in Whisparr v3 (or leave
// it alone if it's already there). Shares the add path with the normal
// per-request dispatch (sendSceneToWhisparrV3) so behavior — profile, root
// folder, "search now" — stays identical between the two.
export async function migrateWhisparrRequestsToV3(): Promise<WhisparrV3MigrationSummary> {
  const { whisparr } = getSettings();
  const summary: WhisparrV3MigrationSummary = {
    added: 0,
    skipped: 0,
    notFound: 0,
    failed: 0,
  };

  const requestRepository = getRepository(MediaRequest);
  const mediaRepository = getRepository(Media);

  const requests = await requestRepository.find({
    where: {
      type: MediaType.SCENE,
      status: In([
        MediaRequestStatus.PENDING,
        MediaRequestStatus.APPROVED,
        MediaRequestStatus.FAILED,
      ]),
    },
    relations: { media: true },
  });

  for (const request of requests) {
    const media = request.media;
    if (!media?.tpdbId) {
      continue;
    }

    try {
      const result = await sendSceneToWhisparrV3({
        tpdbId: media.tpdbId,
        profileId: whisparr.activeProfileId,
        rootFolderPath: whisparr.activeDirectory,
      });

      if (result.status === 'not_found') {
        summary.notFound += 1;
        request.status = MediaRequestStatus.FAILED;
        request.failureReason = NOT_FOUND_REASON;
        request.sentToServiceAt = null;
        await requestRepository.save(request);
        continue;
      }

      media.externalServiceId = result.externalServiceId;
      if (result.hasFile && media.status !== MediaStatus.AVAILABLE) {
        media.status = MediaStatus.PROCESSING;
      }
      await mediaRepository.save(media);

      summary[result.status === 'added' ? 'added' : 'skipped'] += 1;

      request.status = MediaRequestStatus.APPROVED;
      request.failureReason = null;
      request.sentToServiceAt = new Date();
      await requestRepository.save(request);
    } catch (e) {
      summary.failed += 1;
      logger.error('Failed to migrate Whisparr request to v3', {
        label: 'Whisparr v3 Migration',
        requestId: request.id,
        errorMessage: e.message,
      });
      request.status = MediaRequestStatus.FAILED;
      request.failureReason = truncate(e.message, { length: 255 });
      request.sentToServiceAt = null;
      await requestRepository.save(request);
    }
  }

  return summary;
}
