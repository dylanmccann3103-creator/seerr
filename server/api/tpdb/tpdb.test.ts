import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import type { AxiosInstance } from 'axios';

import Tpdb from '@server/api/tpdb';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';

function getAxios(tpdb: Tpdb): AxiosInstance {
  return (tpdb as unknown as { axios: AxiosInstance }).axios;
}

describe('Tpdb constructor', () => {
  afterEach(() => {
    mock.restoreAll();
    getSettings().tpdb = { apiKey: '' };
    delete process.env.TPDB_API_KEY;
  });

  it('authorizes with the settings API key when set', () => {
    getSettings().tpdb = { apiKey: 'settings-key' };
    const tpdb = new Tpdb();

    assert.strictEqual(
      getAxios(tpdb).defaults.headers.Authorization,
      'Bearer settings-key'
    );
  });

  it('falls back to TPDB_API_KEY when settings has no key', () => {
    getSettings().tpdb = { apiKey: '' };
    process.env.TPDB_API_KEY = 'env-key';
    const tpdb = new Tpdb();

    assert.strictEqual(
      getAxios(tpdb).defaults.headers.Authorization,
      'Bearer env-key'
    );
  });

  it('prefers the settings key over the env var when both are set', () => {
    getSettings().tpdb = { apiKey: 'settings-key' };
    process.env.TPDB_API_KEY = 'env-key';
    const tpdb = new Tpdb();

    assert.strictEqual(
      getAxios(tpdb).defaults.headers.Authorization,
      'Bearer settings-key'
    );
  });

  it('wires up the tpdb cache', async () => {
    const tpdb = new Tpdb();
    const get = mock.method(getAxios(tpdb), 'get', async () => ({
      data: { data: { id: 'abc', title: 'Cached Scene', site_id: 1 } },
    }));

    await tpdb.getScene({ sceneId: 'abc' });
    await tpdb.getScene({ sceneId: 'abc' });

    assert.strictEqual(get.mock.callCount(), 1);
    cacheManager.getCache('tpdb').flush();
  });
});

describe('Tpdb search methods', () => {
  afterEach(() => mock.restoreAll());

  it('searches scenes with the q and page params', async () => {
    const tpdb = new Tpdb();
    const get = mock.method(getAxios(tpdb), 'get', async () => ({
      data: { data: [], meta: {} },
    }));

    await tpdb.searchScenes({ query: 'foo', page: 2 });

    assert.strictEqual(get.mock.calls[0].arguments[0], '/scenes');
    assert.deepStrictEqual(get.mock.calls[0].arguments[1]?.params, {
      q: 'foo',
      page: 2,
    });
  });

  it('searches sites with the q and page params', async () => {
    const tpdb = new Tpdb();
    const get = mock.method(getAxios(tpdb), 'get', async () => ({
      data: { data: [], meta: {} },
    }));

    await tpdb.searchSites({ query: 'bar', page: 1 });

    assert.strictEqual(get.mock.calls[0].arguments[0], '/sites');
    assert.deepStrictEqual(get.mock.calls[0].arguments[1]?.params, {
      q: 'bar',
      page: 1,
    });
  });

  it('searches performers with the q and page params', async () => {
    const tpdb = new Tpdb();
    const get = mock.method(getAxios(tpdb), 'get', async () => ({
      data: { data: [], meta: {} },
    }));

    await tpdb.searchPerformers({ query: 'baz' });

    assert.strictEqual(get.mock.calls[0].arguments[0], '/performers');
    assert.deepStrictEqual(get.mock.calls[0].arguments[1]?.params, {
      q: 'baz',
      page: 1,
    });
  });
});

describe('Tpdb get-by-id methods', () => {
  afterEach(() => mock.restoreAll());

  it('unwraps the data envelope for getScene', async () => {
    const tpdb = new Tpdb();
    const scene = { id: 'abc', title: 'A Scene', site_id: 1 };
    const get = mock.method(getAxios(tpdb), 'get', async () => ({
      data: { data: scene },
    }));

    const result = await tpdb.getScene({ sceneId: 'abc' });

    assert.strictEqual(get.mock.calls[0].arguments[0], '/scenes/abc');
    assert.deepStrictEqual(result, scene);
  });

  it('unwraps the data envelope for getSite', async () => {
    const tpdb = new Tpdb();
    const site = { id: 92, name: 'Brazzers' };
    const get = mock.method(getAxios(tpdb), 'get', async () => ({
      data: { data: site },
    }));

    const result = await tpdb.getSite({ siteId: 92 });

    assert.strictEqual(get.mock.calls[0].arguments[0], '/sites/92');
    assert.deepStrictEqual(result, site);
  });

  it('unwraps the data envelope for getPerformer', async () => {
    const tpdb = new Tpdb();
    const performer = { id: 'xyz', name: 'A Performer' };
    const get = mock.method(getAxios(tpdb), 'get', async () => ({
      data: { data: performer },
    }));

    const result = await tpdb.getPerformer({ performerId: 'xyz' });

    assert.strictEqual(get.mock.calls[0].arguments[0], '/performers/xyz');
    assert.deepStrictEqual(result, performer);
  });
});

describe('Tpdb listing methods', () => {
  afterEach(() => mock.restoreAll());

  it('requests recent scenes with only a page param (no q)', async () => {
    const tpdb = new Tpdb();
    const get = mock.method(getAxios(tpdb), 'get', async () => ({
      data: { data: [], meta: {} },
    }));

    await tpdb.getRecentScenes({ page: 3 });

    assert.strictEqual(get.mock.calls[0].arguments[0], '/scenes');
    assert.deepStrictEqual(get.mock.calls[0].arguments[1]?.params, {
      page: 3,
    });
  });

  it('defaults to page 1 when not given', async () => {
    const tpdb = new Tpdb();
    const get = mock.method(getAxios(tpdb), 'get', async () => ({
      data: { data: [], meta: {} },
    }));

    await tpdb.getRecentScenes();

    assert.deepStrictEqual(get.mock.calls[0].arguments[1]?.params, {
      page: 1,
    });
  });

  it('requests the default site listing for getPopularSites', async () => {
    const tpdb = new Tpdb();
    const get = mock.method(getAxios(tpdb), 'get', async () => ({
      data: { data: [], meta: {} },
    }));

    await tpdb.getPopularSites({ page: 2 });

    assert.strictEqual(get.mock.calls[0].arguments[0], '/sites');
    assert.deepStrictEqual(get.mock.calls[0].arguments[1]?.params, {
      page: 2,
    });
  });

  it('requests performers listing with a page param', async () => {
    const tpdb = new Tpdb();
    const get = mock.method(getAxios(tpdb), 'get', async () => ({
      data: { data: [], meta: {} },
    }));

    await tpdb.getPerformers({ page: 4 });

    assert.strictEqual(get.mock.calls[0].arguments[0], '/performers');
    assert.deepStrictEqual(get.mock.calls[0].arguments[1]?.params, {
      page: 4,
    });
  });

  it('filters scenes by site_id for getSiteScenes', async () => {
    const tpdb = new Tpdb();
    const get = mock.method(getAxios(tpdb), 'get', async () => ({
      data: { data: [], meta: {} },
    }));

    await tpdb.getSiteScenes({ siteId: 92, page: 5 });

    assert.strictEqual(get.mock.calls[0].arguments[0], '/scenes');
    assert.deepStrictEqual(get.mock.calls[0].arguments[1]?.params, {
      site_id: 92,
      page: 5,
    });
  });
});
