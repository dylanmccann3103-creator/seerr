import type { MediaRequest } from '@server/entity/MediaRequest';
import type { NonFunctionProperties } from '@server/interfaces/api/common';
import type { MovieDetails } from '@server/models/Movie';
import type { SceneDetails } from '@server/models/Scene';
import type { SiteDetails } from '@server/models/Site';
import type { TvDetails } from '@server/models/Tv';
import useSWR from 'swr';

// One normalized "what is this request about" for RequestCard/RequestItem so
// they stop branching on movie/tv/scene/site everywhere.

export type RequestType = 'movie' | 'tv' | 'scene' | 'site';
type AnyRequest = Pick<NonFunctionProperties<MediaRequest>, 'type' | 'media'>;

export const requestType = (request: AnyRequest): RequestType =>
  request.type as RequestType;

export const isSeasonalRequest = (type: string): boolean =>
  type === 'tv' || type === 'site';

// Scene/site rows are keyed on tpdbId (tmdbId is 0 for them).
export const requestMediaId = (request: AnyRequest): number =>
  request.type === 'scene' || request.type === 'site'
    ? Number(request.media.tpdbId)
    : request.media.tmdbId;

export const requestLink = (request: AnyRequest): string =>
  `/${request.type}/${requestMediaId(request)}`;

export interface RequestTitle {
  name: string;
  year?: string;
  posterUrl?: string;
  backdropUrl?: string;
  link: string;
  imageType: 'tmdb' | 'tpdb';
}

type Details = MovieDetails | TvDetails | SceneDetails | SiteDetails;

const useRequestTitle = (request: AnyRequest, enabled = true) => {
  const { data, error } = useSWR<Details>(
    enabled ? `/api/v1/${request.type}/${requestMediaId(request)}` : null
  );

  let title: RequestTitle | undefined;
  if (data) {
    const link = requestLink(request);
    switch (requestType(request)) {
      case 'movie': {
        const m = data as MovieDetails;
        title = {
          name: m.title,
          year: m.releaseDate,
          posterUrl: m.posterPath
            ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${m.posterPath}`
            : undefined,
          backdropUrl: m.backdropPath
            ? `https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/${m.backdropPath}`
            : undefined,
          link,
          imageType: 'tmdb',
        };
        break;
      }
      case 'tv': {
        const t = data as TvDetails;
        title = {
          name: t.name,
          year: t.firstAirDate,
          posterUrl: t.posterPath
            ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${t.posterPath}`
            : undefined,
          backdropUrl: t.backdropPath
            ? `https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/${t.backdropPath}`
            : undefined,
          link,
          imageType: 'tmdb',
        };
        break;
      }
      case 'scene': {
        const s = data as SceneDetails;
        title = {
          name: s.title,
          year: s.releaseDate,
          posterUrl: s.posterPath,
          backdropUrl: s.backdropPath,
          link,
          imageType: 'tpdb',
        };
        break;
      }
      case 'site': {
        const s = data as SiteDetails;
        title = {
          name: s.name,
          posterUrl: s.posterPath,
          link,
          imageType: 'tpdb',
        };
        break;
      }
    }
  }

  return { title, error, data };
};

export default useRequestTitle;
