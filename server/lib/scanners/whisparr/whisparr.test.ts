import type { EpisodeResult, WhisparrSite } from '@server/api/servarr/whisparr';
import WhisparrAPI from '@server/api/servarr/whisparr';
import StashAPI from '@server/api/stash';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaRequest from '@server/entity/MediaRequest';
import Season from '@server/entity/Season';
import { User } from '@server/entity/User';
import { mapPath } from '@server/lib/scanners/library';
import { whisparrScanner } from '@server/lib/scanners/whisparr';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

let sites: WhisparrSite[] = [];
let episodes: EpisodeResult[] = [];
let stashPaths: string[] = [];
const stashQueries: string[] = [];

mock.method(WhisparrAPI.prototype, 'getSites', async () => sites);
mock.method(WhisparrAPI.prototype, 'getEpisodes', async () => episodes);
// findSceneByPath is a class field (arrow fn); intercept the assignment.
Object.defineProperty(StashAPI.prototype, 'findSceneByPath', {
  set() {},
  get() {
    return async (path: string) => {
      stashQueries.push(path);
      return stashPaths.includes(path) ? { id: '1' } : null;
    };
  },
  configurable: true,
});
mock.method(MediaRequest, 'sendNotification', async () => undefined);

setupTestDb();

const site = (overrides: Partial<WhisparrSite> = {}): WhisparrSite =>
  ({
    id: 7,
    tvdbId: 92,
    title: 'Brazzers',
    titleSlug: 'brazzers',
    seasons: [
      {
        seasonNumber: 2010,
        monitored: true,
        statistics: { totalEpisodeCount: 2, episodeFileCount: 1 },
      },
      {
        seasonNumber: 2011,
        monitored: false,
        statistics: { totalEpisodeCount: 1, episodeFileCount: 0 },
      },
    ],
    ...overrides,
  }) as WhisparrSite;

const episode = (overrides: Partial<EpisodeResult>): EpisodeResult =>
  ({
    seriesId: 7,
    seasonNumber: 2010,
    title: 'Scene',
    hasFile: false,
    monitored: true,
    ...overrides,
  }) as EpisodeResult;

describe('Whisparr Scanner', () => {
  beforeEach(() => {
    const settings = getSettings();
    settings.whisparr.enabled = true;
    settings.whisparr.hostname = 'localhost';
    settings.whisparr.apiKey = 'key';
    settings.stash.enabled = true;
    settings.stash.url = 'http://stash';
    settings.stash.pathMappings = [{ from: '/data', to: '/mnt/stash' }];
    settings.jellyfin.enabled = false;
    sites = [];
    episodes = [];
    stashPaths = [];
    stashQueries.length = 0;
  });

  it('maps path prefixes', () => {
    const mappings = [{ from: '/data/', to: '/mnt/stash' }];
    assert.equal(mapPath('/data/a/b.mp4', mappings), '/mnt/stash/a/b.mp4');
    assert.equal(mapPath('/database/x.mp4', mappings), '/database/x.mp4');
    assert.equal(mapPath('C:\\data\\x.mp4', []), 'C:/data/x.mp4');
  });

  it('marks scenes available only when a library has the file', async () => {
    sites = [site()];
    episodes = [
      episode({
        id: 1,
        tvdbId: 1001,
        hasFile: true,
        episodeFile: { id: 1, path: '/data/brazzers/2010/one.mp4' },
      }),
      episode({
        id: 2,
        tvdbId: 1002,
        hasFile: true,
        episodeFile: { id: 2, path: '/data/brazzers/2010/two.mp4' },
      }),
      episode({ id: 3, tvdbId: 1003, seasonNumber: 2011, monitored: false }),
    ];
    stashPaths = ['/mnt/stash/brazzers/2010/one.mp4'];

    await whisparrScanner.run();

    const mediaRepository = getRepository(Media);
    const scenes = await mediaRepository.find({
      where: { mediaType: MediaType.SCENE },
      order: { tpdbId: 'ASC' },
    });
    assert.deepEqual(
      scenes.map((s) => [s.tpdbId, s.status, s.externalServiceId]),
      [
        ['1001', MediaStatus.AVAILABLE, 1],
        ['1002', MediaStatus.PROCESSING, 2],
      ]
    );
    assert.ok(stashQueries.includes('/mnt/stash/brazzers/2010/one.mp4'));

    const siteMedia = await mediaRepository.findOneOrFail({
      where: { mediaType: MediaType.SITE, tpdbId: '92' },
    });
    assert.equal(siteMedia.status, MediaStatus.PARTIALLY_AVAILABLE);
    assert.equal(siteMedia.externalServiceId, 7);
    assert.equal(siteMedia.externalServiceSlug, 'brazzers');
    const byYear = Object.fromEntries(
      siteMedia.seasons.map((s) => [s.seasonNumber, s.status])
    );
    assert.equal(byYear[2010], MediaStatus.PARTIALLY_AVAILABLE);
    assert.equal(byYear[2011], MediaStatus.UNKNOWN);
  });

  it('resets orphaned PROCESSING media and declines its approved request', async () => {
    const mediaRepository = getRepository(Media);
    const user = await getRepository(User).findOneOrFail({ where: { id: 1 } });

    const media = await mediaRepository.save(
      new Media({
        mediaType: MediaType.SITE,
        tmdbId: 0,
        tpdbId: '555',
        status: MediaStatus.PROCESSING,
        status4k: MediaStatus.UNKNOWN,
        seasons: [
          new Season({
            seasonNumber: 2010,
            status: MediaStatus.PROCESSING,
            status4k: MediaStatus.UNKNOWN,
          }),
        ],
      })
    );
    const request = await getRepository(MediaRequest).save(
      new MediaRequest({
        media,
        requestedBy: user,
        type: MediaType.SITE,
        status: MediaRequestStatus.APPROVED,
        // already dispatched, so the subscriber's Whisparr send is skipped
        sentToServiceAt: new Date(),
        is4k: false,
        seasons: [],
      })
    );

    sites = [site({ tvdbId: 92 })];

    await whisparrScanner.run();

    const updated = await mediaRepository.findOneOrFail({
      where: { id: media.id },
    });
    assert.equal(updated.status, MediaStatus.UNKNOWN);
    assert.equal(updated.seasons[0].status, MediaStatus.UNKNOWN);
    const updatedRequest = await getRepository(MediaRequest).findOneOrFail({
      where: { id: request.id },
    });
    assert.equal(updatedRequest.status, MediaRequestStatus.DECLINED);
  });

  it('does nothing when Whisparr is disabled', async () => {
    getSettings().whisparr.enabled = false;
    sites = [site()];

    await whisparrScanner.run();

    assert.equal(await getRepository(Media).count(), 0);
  });
});
