import JellyfinAPI from '@server/api/jellyfin';
import StashAPI from '@server/api/stash';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { getSettings } from '@server/lib/settings';
import { getHostname } from '@server/utils/getHostname';

// Library availability for scenes (PLAN.md D3): Whisparr knows each episode's file
// path; a library "has" a scene when the same file shows up on its side. Whisparr
// and the libraries run in different containers, so each library carries a
// prefix-rewrite table from Whisparr paths to its own mount.

export interface PathMapping {
  from: string;
  to: string;
}

export interface PathLookup {
  name: string;
  has: (whisparrPath: string) => Promise<boolean>;
}

export const normalizePath = (path: string): string =>
  path.replace(/\\/g, '/').replace(/\/+$/, '');

export const mapPath = (path: string, mappings: PathMapping[]): string => {
  const normalized = normalizePath(path);
  for (const { from, to } of mappings) {
    const prefix = normalizePath(from);
    if (
      prefix &&
      (normalized === prefix || normalized.startsWith(`${prefix}/`))
    ) {
      return normalizePath(to) + normalized.slice(prefix.length);
    }
  }
  return normalized;
};

// ponytail: one GraphQL round-trip per file. Preload all Stash paths in pages
// if a run ever gets slow; the client already exposes findScenes for that.
export const stashLookup = (): PathLookup | null => {
  const { stash } = getSettings();
  if (!stash.enabled || !stash.url) {
    return null;
  }
  const api = new StashAPI({ url: stash.url, apiKey: stash.apiKey });
  return {
    name: 'Stash',
    has: async (whisparrPath) =>
      (await api.findSceneByPath(mapPath(whisparrPath, stash.pathMappings))) !==
      null,
  };
};

export const jellyfinLookup = async (): Promise<PathLookup | null> => {
  const { jellyfin } = getSettings();
  if (!jellyfin.enabled || !jellyfin.apiKey) {
    return null;
  }
  const admin = await getRepository(User).findOne({
    where: { id: 1 },
    select: ['id', 'jellyfinUserId', 'jellyfinDeviceId'],
  });
  if (!admin) {
    return null;
  }
  const api = new JellyfinAPI(
    getHostname(),
    jellyfin.apiKey,
    admin.jellyfinDeviceId
  );
  api.setUserId(admin.jellyfinUserId ?? '');

  const paths = new Set<string>();
  for (const library of jellyfin.libraries.filter((l) => l.enabled)) {
    for (const path of await api.getLibraryPaths(library.id)) {
      paths.add(normalizePath(path));
    }
  }
  const mappings = jellyfin.pathMappings ?? [];
  return {
    name: 'Jellyfin',
    has: async (whisparrPath) => paths.has(mapPath(whisparrPath, mappings)),
  };
};
