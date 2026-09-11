// Raw ThePornDB (TPDB) response types. Only fields verified against the live API
// (or explicitly called out in the task spec) are required; everything else is
// optional since TPDB's shape varies between endpoints (e.g. scene-embedded
// performers vs standalone performer records).

export interface TpdbImageSet {
  full: string | null;
  large: string | null;
  medium: string | null;
  small: string | null;
}

export interface TpdbTag {
  id: number;
  uuid: string;
  name: string;
}

export interface TpdbHash {
  id: number;
  scene_id: number;
  hash: string;
  type: string;
  duration?: number;
  submissions?: number;
  users?: number[];
  created_at?: string;
  updated_at?: string;
}

// A site as embedded in a scene, or returned directly by /sites and /sites/{id}.
// `network` and `parent` are the same shape one level deep (verified live against
// site id 92 "Brazzers", whose network is "MindGeek (Aylo)").
export interface TpdbSite {
  id: number;
  uuid?: string;
  parent_id?: number | null;
  network_id?: number | null;
  name: string;
  short_name?: string;
  url?: string;
  description?: string;
  rating?: number;
  logo?: string | null;
  favicon?: string | null;
  poster?: string | null;
  network?: TpdbSite | null;
  parent?: TpdbSite | null;
}

// Performer as embedded inside a scene's `performers` array. Distinct shape from
// the standalone TpdbPerformer (singular `extra`, includes `site_id`, no `extras`
// /`full_name`/`aliases`/`posters`).
export interface TpdbScenePerformer {
  id: string;
  _id?: number;
  slug?: string;
  site_id?: number;
  name: string;
  bio?: string | null;
  is_parent?: boolean;
  extra?: Record<string, unknown>;
  image?: string | null;
  thumbnail?: string | null;
  face?: string | null;
  parent?: TpdbScenePerformer | null;
}

// Standalone performer, as returned by /performers, /performers/{id} and
// /performers?q=. Note the plural `extras` (vs `extra` on scene-embedded
// performers above).
export interface TpdbPerformer {
  id: string;
  _id?: number;
  slug?: string;
  name: string;
  full_name?: string;
  disambiguation?: string | null;
  bio?: string | null;
  rating?: number;
  is_parent?: boolean;
  extras?: Record<string, unknown>;
  aliases?: string[];
  image?: string | null;
  thumbnail?: string | null;
  face?: string | null;
  posters?: TpdbImageSet;
  site_performers?: TpdbScenePerformer[];
}

export interface TpdbScene {
  id: string;
  _id?: number;
  title: string;
  type?: string;
  slug?: string;
  external_id?: string;
  description?: string | null;
  rating?: number;
  site_id: number;
  date?: string;
  url?: string;
  image?: string | null;
  back_image?: string | null;
  poster_image?: string | null;
  poster?: string | null;
  trailer?: string | null;
  duration?: number;
  format?: string | null;
  sku?: string | null;
  posters?: TpdbImageSet;
  // Verified live: an image-set object (full/large/medium/small), not a plain string.
  background?: TpdbImageSet;
  background_back?: TpdbImageSet;
  created?: string;
  last_updated?: string;
  performers?: TpdbScenePerformer[];
  site?: TpdbSite;
  tags?: TpdbTag[];
  hashes?: TpdbHash[];
  directors?: unknown[];
  links?: unknown[];
  // Only present on /scenes/{id}, not on list results.
  markers?: unknown[];
  scenes?: unknown[];
  movies?: unknown[];
}

export interface TpdbPaginationMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  from: number | null;
  to: number | null;
  total: number;
}

// Laravel-style pagination envelope used by every TPDB list endpoint.
export interface TpdbPaginatedResponse<T> {
  data: T[];
  links?: unknown[];
  meta: TpdbPaginationMeta;
}

export interface TpdbSingleResponse<T> {
  data: T;
}
