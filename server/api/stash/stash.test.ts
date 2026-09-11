import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import type { AxiosInstance } from 'axios';

import StashAPI from '@server/api/stash';

function getAxios(stash: StashAPI): AxiosInstance {
  return (stash as unknown as { axios: AxiosInstance }).axios;
}

describe('StashAPI constructor', () => {
  afterEach(() => mock.restoreAll());

  it('sends the ApiKey header (not Authorization)', () => {
    const stash = new StashAPI({
      url: 'http://localhost:9999',
      apiKey: 'my-key',
    });

    assert.strictEqual(getAxios(stash).defaults.headers.ApiKey, 'my-key');
    assert.strictEqual(
      getAxios(stash).defaults.headers.Authorization,
      undefined
    );
  });
});

describe('StashAPI.findSceneByPath', () => {
  afterEach(() => mock.restoreAll());

  it('posts a GraphQL findScenes query with the path in variables', async () => {
    const stash = new StashAPI({ url: 'http://localhost:9999', apiKey: 'key' });
    const scene = {
      id: '1',
      title: 'A Scene',
      files: [{ path: '/data/scene.mp4' }],
      stash_ids: [],
    };
    const post = mock.method(getAxios(stash), 'post', async () => ({
      data: { data: { findScenes: { count: 1, scenes: [scene] } } },
    }));

    const result = await stash.findSceneByPath('/data/scene.mp4');

    assert.strictEqual(post.mock.callCount(), 1);
    assert.strictEqual(post.mock.calls[0].arguments[0], '/graphql');
    const body = post.mock.calls[0].arguments[1] as {
      query: string;
      variables: Record<string, unknown>;
    };
    assert.match(body.query, /findScenes/);
    assert.deepStrictEqual(body.variables, { path: '/data/scene.mp4' });
    assert.deepStrictEqual(result, scene);
  });

  it('returns null when no scene matches', async () => {
    const stash = new StashAPI({ url: 'http://localhost:9999', apiKey: 'key' });
    mock.method(getAxios(stash), 'post', async () => ({
      data: { data: { findScenes: { count: 0, scenes: [] } } },
    }));

    const result = await stash.findSceneByPath('/data/missing.mp4');

    assert.strictEqual(result, null);
  });
});

describe('StashAPI.findScenesByStashId', () => {
  afterEach(() => mock.restoreAll());

  it('posts a GraphQL findScenes query filtered on stash_ids_endpoint', async () => {
    const stash = new StashAPI({ url: 'http://localhost:9999', apiKey: 'key' });
    const scene = {
      id: '2',
      title: 'Another Scene',
      files: [{ path: '/data/other.mp4' }],
      stash_ids: [{ endpoint: 'https://stashdb.org/graphql', stash_id: 'abc' }],
    };
    const post = mock.method(getAxios(stash), 'post', async () => ({
      data: { data: { findScenes: { count: 1, scenes: [scene] } } },
    }));

    const result = await stash.findScenesByStashId('abc');

    assert.strictEqual(post.mock.callCount(), 1);
    const body = post.mock.calls[0].arguments[1] as {
      query: string;
      variables: Record<string, unknown>;
    };
    assert.match(body.query, /findScenes/);
    assert.match(body.query, /stash_ids_endpoint/);
    assert.deepStrictEqual(body.variables, { stashId: 'abc' });
    assert.deepStrictEqual(result, [scene]);
  });
});

describe('StashAPI.getSystemStatus / getSceneCount', () => {
  afterEach(() => mock.restoreAll());

  it('unwraps systemStatus', async () => {
    const stash = new StashAPI({ url: 'http://localhost:9999', apiKey: 'key' });
    const status = { databaseSchema: 68, appSchema: 68, status: 'OK' };
    mock.method(getAxios(stash), 'post', async () => ({
      data: { data: { systemStatus: status } },
    }));

    const result = await stash.getSystemStatus();

    assert.deepStrictEqual(result, status);
  });

  it('unwraps stats.scene_count', async () => {
    const stash = new StashAPI({ url: 'http://localhost:9999', apiKey: 'key' });
    mock.method(getAxios(stash), 'post', async () => ({
      data: { data: { stats: { scene_count: 42 } } },
    }));

    const result = await stash.getSceneCount();

    assert.strictEqual(result, 42);
  });
});

describe('StashAPI GraphQL error handling', () => {
  afterEach(() => mock.restoreAll());

  it('throws when the response carries GraphQL errors', async () => {
    const stash = new StashAPI({ url: 'http://localhost:9999', apiKey: 'key' });
    mock.method(getAxios(stash), 'post', async () => ({
      data: { errors: [{ message: 'boom' }] },
    }));

    await assert.rejects(() => stash.getSceneCount(), /boom/);
  });
});

describe('StashAPI.buildSceneUrl', () => {
  it('builds a deep link to the scene', () => {
    assert.strictEqual(
      StashAPI.buildSceneUrl('http://localhost:9999', '123'),
      'http://localhost:9999/scenes/123'
    );
  });

  it('strips a trailing slash from the base URL', () => {
    assert.strictEqual(
      StashAPI.buildSceneUrl('http://localhost:9999/', '123'),
      'http://localhost:9999/scenes/123'
    );
  });
});
