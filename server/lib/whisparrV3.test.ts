import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { TpdbScene } from '@server/api/tpdb/interfaces';
import { extractStashIdFromLinks } from '@server/lib/whisparrV3';

const baseScene: TpdbScene = {
  id: 'tpdb-id',
  title: 'Some Scene',
  site_id: 1,
};

describe('extractStashIdFromLinks', () => {
  it('finds a StashDB uuid nested anywhere in the links array', () => {
    const scene: TpdbScene = {
      ...baseScene,
      links: [
        { site: 'IAFD', url: 'https://iafd.com/title.rme/title=whatever' },
        {
          site: 'StashDB',
          url: 'https://stashdb.org/scenes/3fa85f64-5717-4562-b3fc-2c963f66afa6',
        },
      ],
    };

    assert.strictEqual(
      extractStashIdFromLinks(scene),
      '3fa85f64-5717-4562-b3fc-2c963f66afa6'
    );
  });

  it('returns undefined when there is no StashDB link', () => {
    const scene: TpdbScene = {
      ...baseScene,
      links: [{ site: 'IAFD', url: 'https://iafd.com/title.rme' }],
    };

    assert.strictEqual(extractStashIdFromLinks(scene), undefined);
  });

  it('returns undefined when links is missing entirely', () => {
    assert.strictEqual(extractStashIdFromLinks(baseScene), undefined);
  });
});
