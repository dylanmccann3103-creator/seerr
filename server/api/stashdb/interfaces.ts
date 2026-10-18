// Raw StashDB (https://stashdb.org/graphql) response shapes — only the
// fields the v3 fallback lookup needs (schema introspected live 2026-10).

export interface StashDbStudio {
  id: string;
  name: string;
}

export interface StashDbScene {
  id: string;
  title: string | null;
  release_date: string | null;
  studio: StashDbStudio | null;
}
