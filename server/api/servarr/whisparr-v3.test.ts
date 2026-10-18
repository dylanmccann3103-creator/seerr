import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import type { AxiosInstance } from 'axios';

import WhisparrV3API from '@server/api/servarr/whisparr-v3';

function buildWhisparr(): WhisparrV3API {
  return new WhisparrV3API({
    url: 'http://localhost:6969/api/v3',
    apiKey: 'test',
  });
}

function getAxios(whisparr: WhisparrV3API): AxiosInstance {
  return (whisparr as unknown as { axios: AxiosInstance }).axios;
}

describe('WhisparrV3API getSceneByStashId', () => {
  afterEach(() => mock.restoreAll());

  it('queries /movie/lookup with a stash: prefixed term', async () => {
    const whisparr = buildWhisparr();
    const get = mock.method(getAxios(whisparr), 'get', async () => ({
      data: [{ id: 9, title: 'Test Scene' }],
    }));

    await whisparr.getSceneByStashId('abc-123');

    assert.strictEqual(get.mock.callCount(), 1);
    assert.strictEqual(get.mock.calls[0].arguments[0], '/movie/lookup');
    assert.deepStrictEqual(get.mock.calls[0].arguments[1], {
      params: { term: 'stash:abc-123' },
    });
  });

  it('returns undefined when nothing matches', async () => {
    const whisparr = buildWhisparr();
    mock.method(getAxios(whisparr), 'get', async () => ({ data: [] }));

    assert.strictEqual(await whisparr.getSceneByStashId('nope'), undefined);
  });
});

describe('WhisparrV3API addScene', () => {
  afterEach(() => mock.restoreAll());

  it('returns the existing scene without posting when already in the library', async () => {
    const whisparr = buildWhisparr();
    mock.method(WhisparrV3API.prototype, 'getSceneByStashId', async () => ({
      id: 5,
      title: 'Already Added',
      foreignId: 'abc-123',
      hasFile: false,
      monitored: true,
      qualityProfileId: 1,
      tags: [],
    }));
    const post = mock.method(getAxios(whisparr), 'post', async () => ({
      data: {},
    }));

    const result = await whisparr.addScene({
      foreignId: 'abc-123',
      profileId: 1,
      rootFolderPath: '/data',
    });

    assert.strictEqual(result.id, 5);
    assert.strictEqual(post.mock.callCount(), 0);
  });

  it('posts a new movie when the scene is not yet in the library', async () => {
    const whisparr = buildWhisparr();
    mock.method(WhisparrV3API.prototype, 'getSceneByStashId', async () => ({
      id: undefined,
      title: 'Not Added Yet',
      foreignId: 'abc-123',
      hasFile: false,
      monitored: false,
      qualityProfileId: 1,
      tags: [],
    }));
    const post = mock.method(getAxios(whisparr), 'post', async () => ({
      data: { id: 7, foreignId: 'abc-123', title: 'Not Added Yet' },
    }));

    const result = await whisparr.addScene({
      foreignId: 'abc-123',
      profileId: 1,
      rootFolderPath: '/data',
      searchNow: false,
    });

    assert.strictEqual(result.id, 7);
    assert.strictEqual(post.mock.callCount(), 1);
    assert.strictEqual(post.mock.calls[0].arguments[0], '/movie');
    assert.strictEqual(
      (post.mock.calls[0].arguments[1] as { foreignId: string }).foreignId,
      'abc-123'
    );
  });

  it('throws when the scene has no StashDB lookup result at all', async () => {
    const whisparr = buildWhisparr();
    mock.method(
      WhisparrV3API.prototype,
      'getSceneByStashId',
      async () => undefined
    );

    await assert.rejects(() =>
      whisparr.addScene({
        foreignId: 'unknown',
        profileId: 1,
        rootFolderPath: '/data',
      })
    );
  });
});
