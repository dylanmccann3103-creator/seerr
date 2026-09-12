import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import type { AxiosInstance } from 'axios';

import WhisparrAPI from '@server/api/servarr/whisparr';

function buildWhisparr(): WhisparrAPI {
  return new WhisparrAPI({
    url: 'http://localhost:6969/api/v3',
    apiKey: 'test',
  });
}

function getAxios(whisparr: WhisparrAPI): AxiosInstance {
  return (whisparr as unknown as { axios: AxiosInstance }).axios;
}

describe('WhisparrAPI removeSite', () => {
  afterEach(() => mock.restoreAll());

  it('removes the site when it exists in the library', async () => {
    const whisparr = buildWhisparr();
    mock.method(WhisparrAPI.prototype, 'getSiteByTpdbId', async () => ({
      id: 9,
      title: 'Test Site',
    }));
    const del = mock.method(getAxios(whisparr), 'delete', async () => ({}));

    await whisparr.removeSite(1234);

    assert.strictEqual(del.mock.callCount(), 1);
    assert.strictEqual(del.mock.calls[0].arguments[0], '/series/9');
  });

  it('does nothing when the site is not in the library', async () => {
    const whisparr = buildWhisparr();
    mock.method(getAxios(whisparr), 'get', async () => ({
      data: [{ id: 0, title: 'Some Site' }],
    }));
    const del = mock.method(getAxios(whisparr), 'delete', async () => ({}));

    await assert.doesNotReject(() => whisparr.removeSite(1234));
    assert.strictEqual(del.mock.callCount(), 0);
  });

  it('ignores a 404 when the site was already removed in Whisparr', async () => {
    const whisparr = buildWhisparr();
    mock.method(WhisparrAPI.prototype, 'getSiteByTpdbId', async () => ({
      id: 9,
      title: 'Test Site',
    }));
    mock.method(getAxios(whisparr), 'delete', async () => {
      throw { response: { status: 404 } };
    });

    await assert.doesNotReject(() => whisparr.removeSite(1234));
  });
});

describe('WhisparrAPI getSiteByTpdbId', () => {
  afterEach(() => mock.restoreAll());

  it('queries /series/lookup with a tpdb: prefixed term', async () => {
    const whisparr = buildWhisparr();
    const get = mock.method(getAxios(whisparr), 'get', async () => ({
      data: [{ id: 9, title: 'Test Site' }],
    }));

    await whisparr.getSiteByTpdbId(4242);

    assert.strictEqual(get.mock.calls[0].arguments[0], '/series/lookup');
    assert.deepStrictEqual(get.mock.calls[0].arguments[1], {
      params: { term: 'tpdb:4242' },
    });
  });

  it('throws "Site not found" when the lookup returns no results', async () => {
    const whisparr = buildWhisparr();
    mock.method(getAxios(whisparr), 'get', async () => ({ data: [] }));

    await assert.rejects(() => whisparr.getSiteByTpdbId(1234), {
      message: 'Site not found',
    });
  });

  it('rethrows a 401 from the lookup with the status intact', async () => {
    const whisparr = buildWhisparr();
    mock.method(getAxios(whisparr), 'get', async () => {
      throw { response: { status: 401 } };
    });

    await assert.rejects(
      () => whisparr.getSiteByTpdbId(1234),
      (e: unknown) =>
        (e as { response?: { status?: number } }).response?.status === 401
    );
  });
});

describe('WhisparrAPI addSite', () => {
  afterEach(() => mock.restoreAll());

  it('upserts an existing site: PUTs the merge and re-monitors episodes', async () => {
    const whisparr = buildWhisparr();
    mock.method(WhisparrAPI.prototype, 'getSiteByTpdbId', async () => ({
      id: 9,
      title: 'Existing Site',
      tags: [1],
      monitored: false,
      seasons: [
        { seasonNumber: 2009, monitored: false },
        { seasonNumber: 2010, monitored: false },
      ],
    }));
    const put = mock.method(getAxios(whisparr), 'put', async (url: string) => {
      if (url === '/series') {
        return {
          data: {
            id: 9,
            title: 'Existing Site',
            seasons: [
              { seasonNumber: 2009, monitored: true },
              { seasonNumber: 2010, monitored: false },
            ],
          },
        };
      }
      return { data: {} };
    });
    mock.method(WhisparrAPI.prototype, 'getEpisodes', async () => [
      { id: 101, seasonNumber: 2009, monitored: false },
      { id: 102, seasonNumber: 2010, monitored: false },
    ]);
    const monitorEpisodes = mock.method(
      WhisparrAPI.prototype,
      'monitorEpisodes',
      async () => undefined
    );
    const searchSite = mock.method(
      WhisparrAPI.prototype,
      'searchSite',
      async () => undefined
    );

    const result = await whisparr.addSite({
      tvdbid: 4242,
      title: 'Existing Site',
      profileId: 1,
      seasons: [2009],
      seasonFolder: true,
      rootFolderPath: '/data',
      searchNow: true,
    });

    assert.strictEqual(result.id, 9);
    // First put call is the upsert merge.
    assert.strictEqual(put.mock.calls[0].arguments[0], '/series');
    // Only the requested season's unmonitored episode gets re-monitored.
    assert.strictEqual(monitorEpisodes.mock.callCount(), 1);
    assert.deepStrictEqual(monitorEpisodes.mock.calls[0].arguments[0], [101]);
    assert.strictEqual(searchSite.mock.callCount(), 1);
  });

  it('creates a new site with only the requested season-years monitored and no languageProfileId', async () => {
    const whisparr = buildWhisparr();
    mock.method(WhisparrAPI.prototype, 'getSiteByTpdbId', async () => ({
      // No id => not yet in the library.
      seasons: [
        { seasonNumber: 2009, monitored: false },
        { seasonNumber: 2010, monitored: false },
        { seasonNumber: 2011, monitored: false },
      ],
    }));
    const post = mock.method(getAxios(whisparr), 'post', async () => ({
      data: { id: 42, title: 'New Site' },
    }));

    await whisparr.addSite({
      tvdbid: 4242,
      title: 'New Site',
      profileId: 1,
      seasons: [2010],
      seasonFolder: true,
      rootFolderPath: '/data',
      searchNow: false,
    });

    const [url, payload] = post.mock.calls[0].arguments as [
      string,
      Record<string, unknown>,
    ];
    assert.strictEqual(url, '/series');
    assert.strictEqual('languageProfileId' in payload, false);
    assert.strictEqual(payload.seriesType, 'standard');
    assert.deepStrictEqual(payload.seasons, [
      { seasonNumber: 2009, monitored: false },
      { seasonNumber: 2010, monitored: true },
      { seasonNumber: 2011, monitored: false },
    ]);
    assert.deepStrictEqual(payload.addOptions, {
      ignoreEpisodesWithFiles: true,
      searchForMissingEpisodes: false,
    });
  });
});

describe('WhisparrAPI buildSeasonList (via addSite)', () => {
  afterEach(() => mock.restoreAll());

  it('treats season numbers as calendar years and only flips the requested ones', async () => {
    const whisparr = buildWhisparr();
    mock.method(WhisparrAPI.prototype, 'getSiteByTpdbId', async () => ({
      id: 9,
      title: 'Existing Site',
      tags: [],
      seasons: [
        { seasonNumber: 2020, monitored: false },
        { seasonNumber: 2021, monitored: false },
        { seasonNumber: 2022, monitored: false },
      ],
    }));
    const put = mock.method(getAxios(whisparr), 'put', async () => ({
      data: { id: 9, title: 'Existing Site' },
    }));
    mock.method(WhisparrAPI.prototype, 'getEpisodes', async () => []);

    await whisparr.addSite({
      tvdbid: 1,
      title: 'Existing Site',
      profileId: 1,
      seasons: [2021],
      seasonFolder: true,
      rootFolderPath: '/data',
    });

    const [, sentSite] = put.mock.calls[0].arguments as [
      string,
      { seasons: { seasonNumber: number; monitored: boolean }[] },
    ];
    assert.deepStrictEqual(sentSite.seasons, [
      { seasonNumber: 2020, monitored: false },
      { seasonNumber: 2021, monitored: true },
      { seasonNumber: 2022, monitored: false },
    ]);
  });
});
