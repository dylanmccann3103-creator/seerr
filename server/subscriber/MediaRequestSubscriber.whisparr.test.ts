import type {
  AddSiteOptions,
  EpisodeResult,
  WhisparrSite,
} from '@server/api/servarr/whisparr';
import WhisparrAPI from '@server/api/servarr/whisparr';
import Tpdb from '@server/api/tpdb';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import Season from '@server/entity/Season';
import { User } from '@server/entity/User';
import { getSettings } from '@server/lib/settings';
import { whisparrEpisodePoll } from '@server/subscriber/MediaRequestSubscriber';
import { setupTestDb } from '@server/test/db';
import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

const SCENE_ID = 5241456;
const SITE_ID = 92;

let addSiteImpl: (o: AddSiteOptions) => Promise<WhisparrSite> = async (o) =>
  ({
    id: 7,
    tvdbId: o.tvdbid,
    title: 'Brazzers',
    titleSlug: 'brazzers',
  }) as WhisparrSite;
let episodesImpl: () => Promise<EpisodeResult[]> = async () => [
  { id: 77, tvdbId: SCENE_ID, seasonNumber: 2009 } as EpisodeResult,
];

const addSite = mock.method(
  WhisparrAPI.prototype,
  'addSite',
  (o: AddSiteOptions) => addSiteImpl(o)
);
mock.method(WhisparrAPI.prototype, 'getEpisodes', () => episodesImpl());
const monitorEpisodes = mock.method(
  WhisparrAPI.prototype,
  'monitorEpisodes',
  async () => undefined
);
const searchEpisodes = mock.method(
  WhisparrAPI.prototype,
  'searchEpisodes',
  async () => undefined
);
mock.method(WhisparrAPI.prototype, 'getSiteByTpdbId', async () => ({
  tvdbId: SITE_ID,
  title: 'Brazzers',
  seasons: [
    { seasonNumber: 2010, monitored: false },
    { seasonNumber: 2011, monitored: false },
  ],
}));
// Tpdb methods are class fields (arrow fns); intercept the assignment.
for (const [name, impl] of [
  [
    'getScene',
    async ({ sceneId }: { sceneId: string }) => ({
      id: 'uuid',
      _id: Number(sceneId),
      title: 'Scene',
      site_id: SITE_ID,
    }),
  ],
  [
    'getSite',
    async ({ siteId }: { siteId: number }) => ({
      id: siteId,
      name: 'Brazzers',
    }),
  ],
] as const) {
  Object.defineProperty(Tpdb.prototype, name, {
    set() {},
    get: () => impl,
    configurable: true,
  });
}
mock.method(MediaRequest, 'sendNotification', async () => undefined);

setupTestDb();

const admin = () =>
  getRepository(User).findOneOrFail({ where: { email: 'admin@seerr.dev' } });
const friend = () =>
  getRepository(User).findOneOrFail({ where: { email: 'friend@seerr.dev' } });
const loadRequest = (id: number) =>
  getRepository(MediaRequest).findOneOrFail({ where: { id } });

describe('Whisparr request flow', () => {
  beforeEach(() => {
    const settings = getSettings();
    settings.whisparr.enabled = true;
    settings.whisparr.hostname = 'localhost';
    settings.whisparr.apiKey = 'key';
    settings.whisparr.activeDirectory = '/data';
    settings.whisparr.activeProfileId = 3;
    settings.whisparr.searchOnRequest = false;
    settings.whisparr.tagRequests = false;
    whisparrEpisodePoll.attempts = 2;
    whisparrEpisodePoll.delayMs = 0;
    addSiteImpl = async (o) =>
      ({
        id: 7,
        tvdbId: o.tvdbid,
        title: 'Brazzers',
        titleSlug: 'brazzers',
      }) as WhisparrSite;
    episodesImpl = async () => [
      { id: 77, tvdbId: SCENE_ID, seasonNumber: 2009 } as EpisodeResult,
    ];
    addSite.mock.resetCalls();
    monitorEpisodes.mock.resetCalls();
    searchEpisodes.mock.resetCalls();
  });

  it('auto-approved scene request adds the site unmonitored and monitors one episode', async () => {
    const request = await MediaRequest.request(
      { mediaId: SCENE_ID, mediaType: MediaType.SCENE },
      await admin()
    );

    assert.equal(addSite.mock.callCount(), 1);
    const options = addSite.mock.calls[0].arguments[0];
    assert.equal(options.tvdbid, SITE_ID);
    assert.deepEqual(options.seasons, []);
    assert.equal(options.searchNow, false);
    assert.equal(options.rootFolderPath, '/data');
    assert.equal(options.profileId, 3);
    assert.deepEqual(monitorEpisodes.mock.calls[0].arguments[0], [77]);
    assert.equal(searchEpisodes.mock.callCount(), 0);

    const persisted = await loadRequest(request.id);
    assert.equal(persisted.status, MediaRequestStatus.APPROVED);
    assert.ok(persisted.sentToServiceAt);
    assert.equal(persisted.media.status, MediaStatus.PROCESSING);
    assert.equal(persisted.media.externalServiceId, 77);
    assert.equal(persisted.media.tpdbId, String(SCENE_ID));
  });

  it('site request for all years resolves years from Whisparr and monitors them', async () => {
    getSettings().whisparr.searchOnRequest = true;
    const request = await MediaRequest.request(
      { mediaId: SITE_ID, mediaType: MediaType.SITE, seasons: 'all' },
      await admin()
    );

    assert.deepEqual(
      request.seasons.map((s) => s.seasonNumber),
      [2010, 2011]
    );
    const options = addSite.mock.calls[0].arguments[0];
    assert.equal(options.tvdbid, SITE_ID);
    assert.deepEqual(options.seasons, [2010, 2011]);
    assert.equal(options.searchNow, true);
    const persisted = await loadRequest(request.id);
    assert.equal(persisted.media.externalServiceId, 7);
    assert.equal(persisted.media.externalServiceSlug, 'brazzers');
  });

  it('dispatches exactly once across double and concurrent approvals', async () => {
    const pending = await MediaRequest.request(
      { mediaId: SCENE_ID, mediaType: MediaType.SCENE },
      await friend()
    );
    assert.equal(pending.status, MediaRequestStatus.PENDING);
    assert.equal(addSite.mock.callCount(), 0);

    const repo = getRepository(MediaRequest);
    const a = await loadRequest(pending.id);
    const b = await loadRequest(pending.id);
    a.status = MediaRequestStatus.APPROVED;
    b.status = MediaRequestStatus.APPROVED;
    await Promise.allSettled([repo.save(a), repo.save(b)]);
    assert.equal(addSite.mock.callCount(), 1);

    const again = await loadRequest(pending.id);
    again.status = MediaRequestStatus.APPROVED;
    await repo.save(again);
    assert.equal(addSite.mock.callCount(), 1);
  });

  it('marks FAILED with a reason instead of deleting, and retry resends', async () => {
    addSiteImpl = async () => {
      throw new Error('Whisparr exploded');
    };
    const request = await MediaRequest.request(
      { mediaId: SCENE_ID, mediaType: MediaType.SCENE },
      await admin()
    );

    const failed = await loadRequest(request.id);
    assert.equal(failed.status, MediaRequestStatus.FAILED);
    assert.equal(failed.failureReason, 'Whisparr exploded');
    assert.equal(failed.sentToServiceAt, null);
    assert.equal(
      await getRepository(Media).count({ where: { tpdbId: String(SCENE_ID) } }),
      1
    );

    addSiteImpl = async (o) =>
      ({
        id: 7,
        tvdbId: o.tvdbid,
        title: 'Brazzers',
        titleSlug: 'brazzers',
      }) as WhisparrSite;
    failed.status = MediaRequestStatus.APPROVED;
    await getRepository(MediaRequest).save(failed);

    assert.equal(addSite.mock.callCount(), 2);
    const retried = await loadRequest(request.id);
    assert.equal(retried.status, MediaRequestStatus.APPROVED);
    assert.equal(retried.failureReason, 'Whisparr exploded');
    assert.ok(retried.sentToServiceAt);
  });

  it('fails a scene whose episode Whisparr has not indexed, keeping all rows', async () => {
    episodesImpl = async () => [];
    const request = await MediaRequest.request(
      { mediaId: SCENE_ID, mediaType: MediaType.SCENE },
      await admin()
    );

    const failed = await loadRequest(request.id);
    assert.equal(failed.status, MediaRequestStatus.FAILED);
    assert.match(failed.failureReason ?? '', /not found in Whisparr/);
    assert.equal(monitorEpisodes.mock.callCount(), 0);
    assert.equal(await getRepository(MediaRequest).count(), 1);
  });

  it('completes requests when the scanner marks scene and site available', async () => {
    const adminUser = await admin();
    const scene = await MediaRequest.request(
      { mediaId: SCENE_ID, mediaType: MediaType.SCENE },
      adminUser
    );
    const site = await MediaRequest.request(
      { mediaId: SITE_ID, mediaType: MediaType.SITE, seasons: [2010] },
      adminUser
    );

    const mediaRepository = getRepository(Media);
    const sceneMedia = await mediaRepository.findOneOrFail({
      where: { id: scene.media.id },
    });
    sceneMedia.status = MediaStatus.AVAILABLE;
    await mediaRepository.save(sceneMedia);

    const siteMedia = await mediaRepository.findOneOrFail({
      where: { id: site.media.id },
    });
    siteMedia.seasons = [
      new Season({
        seasonNumber: 2010,
        status: MediaStatus.AVAILABLE,
      }),
    ];
    siteMedia.status = MediaStatus.AVAILABLE;
    await mediaRepository.save(siteMedia);

    assert.equal(
      (await loadRequest(scene.id)).status,
      MediaRequestStatus.COMPLETED
    );
    const siteRequest = await loadRequest(site.id);
    assert.equal(siteRequest.status, MediaRequestStatus.COMPLETED);
    assert.equal(siteRequest.seasons[0].status, MediaRequestStatus.COMPLETED);
  });

  it('rejects a duplicate scene request and a site request with no free years', async () => {
    const adminUser = await admin();
    await MediaRequest.request(
      { mediaId: SCENE_ID, mediaType: MediaType.SCENE },
      adminUser
    );
    await assert.rejects(
      MediaRequest.request(
        { mediaId: SCENE_ID, mediaType: MediaType.SCENE },
        adminUser
      ),
      /already exists/
    );

    await MediaRequest.request(
      { mediaId: SITE_ID, mediaType: MediaType.SITE, seasons: [2010] },
      adminUser
    );
    await assert.rejects(
      MediaRequest.request(
        { mediaId: SITE_ID, mediaType: MediaType.SITE, seasons: [2010] },
        adminUser
      ),
      /No years available/
    );
  });
});
