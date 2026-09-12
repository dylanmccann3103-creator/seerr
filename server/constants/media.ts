export enum MediaRequestStatus {
  PENDING = 1,
  APPROVED,
  DECLINED,
  FAILED,
  COMPLETED,
}

export enum MediaType {
  MOVIE = 'movie',
  TV = 'tv',
  SCENE = 'scene',
  SITE = 'site',
}

// Scene behaves like a movie (one item), site like a series (year seasons).
export const isSeasonal = (type: MediaType): boolean =>
  type === MediaType.TV || type === MediaType.SITE;
export const isSingleItem = (type: MediaType): boolean =>
  type === MediaType.MOVIE || type === MediaType.SCENE;
export const isWhisparrType = (type: MediaType): boolean =>
  type === MediaType.SCENE || type === MediaType.SITE;

export enum MediaStatus {
  UNKNOWN = 1,
  PENDING,
  PROCESSING,
  PARTIALLY_AVAILABLE,
  AVAILABLE,
  BLOCKLISTED,
  DELETED,
}
