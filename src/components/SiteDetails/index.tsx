import CachedImage from '@app/components/Common/CachedImage';
import ListView from '@app/components/Common/ListView';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import RequestButton from '@app/components/RequestButton';
import StatusBadge from '@app/components/StatusBadge';
import useDiscover from '@app/hooks/useDiscover';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import type { SceneResult } from '@server/models/Scene';
import type { SiteDetails as SiteDetailsType } from '@server/models/Site';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Fragment } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.SiteDetails', {
  overview: 'Overview',
  overviewunavailable: 'Overview unavailable.',
  years: 'Years',
  monitored: 'Monitored',
  scenes: 'Scenes',
  network: 'Network',
  parent: 'Parent Site',
  viewontpdb: 'View on TPDB',
});

interface SiteDetailsProps {
  site?: SiteDetailsType;
}

const SiteDetails = ({ site }: SiteDetailsProps) => {
  const intl = useIntl();
  const router = useRouter();
  const {
    data,
    error,
    mutate: revalidate,
  } = useSWR<SiteDetailsType>(`/api/v1/site/${router.query.siteId}`, {
    fallbackData: site,
  });

  const scenes = useDiscover<SceneResult>(
    `/api/v1/site/${router.query.siteId}/scenes`,
    undefined,
    { hideAvailable: false, hideBlocklisted: false, hideRequested: false }
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={404} />;
  }

  const attributes: React.ReactNode[] = [];
  if (data.network) {
    attributes.push(
      <Link href={`/site/${data.network.id}`} className="hover:underline">
        {data.network.name}
      </Link>
    );
  }
  if (data.parent && data.parent.id !== data.network?.id) {
    attributes.push(
      <Link href={`/site/${data.parent.id}`} className="hover:underline">
        {data.parent.name}
      </Link>
    );
  }

  const yearStatus = (year: number): MediaStatus =>
    data.mediaInfo?.seasons?.find((s) => s.seasonNumber === year)?.status ??
    MediaStatus.UNKNOWN;

  // The Whisparr scan marks monitored-but-fileless years PROCESSING, which the
  // badge would call "Requested". Only call it that when a request exists.
  const activeRequests = (data.mediaInfo?.requests ?? []).filter(
    (r) =>
      r.status !== MediaRequestStatus.DECLINED &&
      r.status !== MediaRequestStatus.COMPLETED
  );
  const requestedYears = new Set(
    activeRequests.flatMap((r) => r.seasons.map((s) => s.seasonNumber))
  );
  const monitoredLabel = (status: MediaStatus, requested: boolean) =>
    status === MediaStatus.PROCESSING && !requested
      ? intl.formatMessage(messages.monitored)
      : undefined;

  return (
    <div className="media-page">
      <PageTitle title={data.name} />
      <div className="media-header">
        <div className="media-poster">
          <CachedImage
            type="tpdb"
            src={
              data.posterPath ??
              data.logoPath ??
              '/images/seerr_poster_not_found.png'
            }
            alt=""
            sizes="100vw"
            style={{ width: '100%', height: 'auto' }}
            width={600}
            height={900}
            priority
          />
        </div>
        <div className="media-title">
          <div className="media-status">
            {/* ponytail: no mediaType — StatusBadge manage/arr links are movie/tv only. */}
            <StatusBadge
              status={data.mediaInfo?.status}
              statusLabelOverride={monitoredLabel(
                data.mediaInfo?.status ?? MediaStatus.UNKNOWN,
                activeRequests.length > 0
              )}
              downloadItem={data.mediaInfo?.downloadStatus}
              title={data.name}
              mediaType="site"
              tmdbId={data.id}
              inProgress={(data.mediaInfo?.downloadStatus ?? []).length > 0}
            />
          </div>
          <h1 data-testid="media-title">{data.name}</h1>
          {attributes.length > 0 && (
            <span className="media-attributes">
              {attributes
                .map((t, k) => <span key={k}>{t}</span>)
                .reduce((prev, curr) => (
                  <Fragment key={`${prev.key}-${curr.key}`}>
                    {prev} | {curr}
                  </Fragment>
                ))}
            </span>
          )}
        </div>
        <div className="media-actions">
          <RequestButton
            mediaType="site"
            media={data.mediaInfo}
            tmdbId={data.id}
            onUpdate={() => revalidate()}
          />
        </div>
      </div>
      <div className="media-overview">
        <div className="media-overview-left">
          <h2>{intl.formatMessage(messages.overview)}</h2>
          <p>
            {data.description
              ? data.description
              : intl.formatMessage(messages.overviewunavailable)}
          </p>
          {(data.seasons ?? []).length > 0 && (
            <div className="mt-6">
              <h2>{intl.formatMessage(messages.years)}</h2>
              <ul className="mt-2 divide-y divide-gray-700 rounded-md bg-gray-800 ring-1 ring-gray-700">
                {data.seasons?.map(({ seasonNumber }) => (
                  <li
                    key={seasonNumber}
                    className="flex items-center justify-between px-4 py-2 text-white"
                  >
                    <span>{seasonNumber}</span>
                    <StatusBadge
                      status={yearStatus(seasonNumber)}
                      statusLabelOverride={monitoredLabel(
                        yearStatus(seasonNumber),
                        requestedYears.has(seasonNumber)
                      )}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="media-overview-right">
          <div className="media-facts">
            {data.network && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.network)}</span>
                <span className="media-fact-value">
                  <Link
                    href={`/site/${data.network.id}`}
                    className="hover:underline"
                  >
                    {data.network.name}
                  </Link>
                </span>
              </div>
            )}
            {data.parent && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.parent)}</span>
                <span className="media-fact-value">
                  <Link
                    href={`/site/${data.parent.id}`}
                    className="hover:underline"
                  >
                    {data.parent.name}
                  </Link>
                </span>
              </div>
            )}
            {data.url && (
              <div className="media-fact">
                <a
                  href={data.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 hover:underline"
                >
                  {intl.formatMessage(messages.viewontpdb)}
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="slider-header">
        <div className="slider-title">
          <span>{intl.formatMessage(messages.scenes)}</span>
        </div>
      </div>
      <ListView
        items={scenes.titles}
        isEmpty={scenes.isEmpty}
        isLoading={
          scenes.isLoadingInitialData ||
          (scenes.isLoadingMore && (scenes.titles?.length ?? 0) > 0)
        }
        isReachingEnd={scenes.isReachingEnd}
        onScrollBottom={scenes.fetchMore}
      />
    </div>
  );
};

export default SiteDetails;
