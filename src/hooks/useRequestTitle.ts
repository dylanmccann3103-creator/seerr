import type { MediaRequest } from '@server/entity/MediaRequest';
import type { NonFunctionProperties } from '@server/interfaces/api/common';
import type { SceneDetails } from '@server/models/Scene';
import type { SiteDetails } from '@server/models/Site';
import useSWR from 'swr';

// One normalized "what is this request about" for RequestCard/RequestItem.

export type RequestType = 'scene' | 'site';
type AnyRequest = Pick<NonFunctionProperties<MediaRequest>, 'type' | 'media'>;

export const requestType = (request: AnyRequest): RequestType =>
  request.type as RequestType;

export const isSeasonalRequest = (type: string): boolean => type === 'site';

// Scene/site rows are keyed on tpdbId (tmdbId is 0 for them).
export const requestMediaId = (request: AnyRequest): number =>
  Number(request.media.tpdbId);

export const requestLink = (request: AnyRequest): string =>
  `/${request.type}/${requestMediaId(request)}`;

export interface RequestTitle {
  name: string;
  year?: string;
  posterUrl?: string;
  backdropUrl?: string;
  link: string;
  imageType: 'tpdb';
}

export type RequestDetails = SceneDetails | SiteDetails;

const useRequestTitle = (request: AnyRequest, enabled = true) => {
  const { data, error } = useSWR<RequestDetails>(
    enabled ? `/api/v1/${request.type}/${requestMediaId(request)}` : null
  );

  let title: RequestTitle | undefined;
  if (data) {
    const link = requestLink(request);
    title =
      'title' in data
        ? {
            name: data.title,
            year: data.releaseDate,
            posterUrl: data.posterPath,
            backdropUrl: data.backdropPath,
            link,
            imageType: 'tpdb',
          }
        : {
            name: data.name,
            posterUrl: data.posterPath,
            link,
            imageType: 'tpdb',
          };
  }

  return { title, error, data };
};

export default useRequestTitle;
