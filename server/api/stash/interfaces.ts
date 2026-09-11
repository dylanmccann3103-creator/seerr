// Raw Stash (stashapp/stash) GraphQL response types.
//
// Verified against the public schema at
// https://github.com/stashapp/stash/tree/develop/graphql/schema/types (2026-09):
// - types/stash-box.graphql: `type StashID { endpoint: String!, stash_id: String!,
//   updated_at: Time! }`
// - types/scene.graphql: `Scene.paths: ScenePathsType!` (screenshot/stream/etc),
//   `Scene.files: [VideoFile!]!`, `Scene.stash_ids: [StashID!]!`,
//   `type FindScenesResultType { count, duration, filesize, scenes }`
// - types/metadata.graphql: `type SystemStatus { databaseSchema: Int, appSchema: Int!,
//   status: SystemStatusEnum!, ... }`
// - types/stats.graphql: `type StatsResultType { scene_count: Int!, ... }`
//
// Only the fields this client actually reads are declared; Stash's real types have
// many more (title, tags, performers, etc.) that phase D/E don't need yet.

export interface StashSceneFile {
  path: string;
}

export interface StashScenePaths {
  screenshot?: string | null;
  stream?: string | null;
}

export interface StashId {
  endpoint: string;
  stash_id: string;
}

export interface StashScene {
  id: string;
  title?: string | null;
  paths?: StashScenePaths;
  files: StashSceneFile[];
  stash_ids: StashId[];
}

export interface StashFindScenesResult {
  count: number;
  scenes: StashScene[];
}

// TODO: SystemStatusEnum's exact member names (e.g. "OK" / "SETUP" / "NEEDS_MIGRATION")
// aren't confirmed from the schema docs consulted here — typed loosely as `string`.
export interface StashSystemStatus {
  databaseSchema: number | null;
  appSchema: number;
  status: string;
}

export interface StashStats {
  scene_count: number;
}

export interface StashGraphQLError {
  message: string;
}

export interface StashGraphQLResponse<T> {
  data?: T;
  errors?: StashGraphQLError[];
}
