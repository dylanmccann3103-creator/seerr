import type { StashPerformer } from '@server/api/stash/interfaces';
import { pickExactPerformer, toStashProxyPath } from '@server/lib/stashImages';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const p = (name: string, aliases: string[] = []): StashPerformer => ({
  id: name,
  name,
  alias_list: aliases,
  image_path: `http://stash.local/performer/${name}/image?t=1`,
  stash_ids: [],
});

describe('stashImages', () => {
  it('matches only an exact name or alias, case-insensitively', () => {
    const list = [p('Jenny Badeau', ['Leona Lee']), p('Lana Wills')];
    assert.equal(pickExactPerformer('lana wills', list)?.name, 'Lana Wills');
    assert.equal(pickExactPerformer('Leona Lee', list)?.name, 'Jenny Badeau');
    assert.equal(pickExactPerformer('Lana Wills Ls', list), undefined);
  });

  it('turns the Stash image url into a proxy path without the cache-buster', () => {
    assert.equal(
      toStashProxyPath('http://192.168.6.2:30198/performer/12/image?t=99'),
      '/imageproxy/stash/performer/12/image'
    );
    assert.equal(toStashProxyPath('not a url'), undefined);
  });
});
