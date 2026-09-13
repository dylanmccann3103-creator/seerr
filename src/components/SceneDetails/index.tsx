import CachedImage from '@app/components/Common/CachedImage';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import type { PlayButtonLink } from '@app/components/Common/PlayButton';
import PlayButton from '@app/components/Common/PlayButton';
import PersonCard from '@app/components/PersonCard';
import RequestButton from '@app/components/RequestButton';
import StatusBadge from '@app/components/StatusBadge';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import {
  ArrowTopRightOnSquareIcon,
  PlayIcon,
} from '@heroicons/react/24/outline';
import type { SceneDetails as SceneDetailsType } from '@server/models/Scene';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Fragment } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.SceneDetails', {
  overview: 'Overview',
  overviewunavailable: 'Overview unavailable.',
  performers: 'Performers',
  tags: 'Tags',
  releasedate: 'Release Date',
  duration: 'Duration',
  minutes: '{minutes} minutes',
  site: 'Site',
  viewontpdb: 'View on TPDB',
  play: 'Play',
});

interface SceneDetailsProps {
  scene?: SceneDetailsType;
}

const SceneDetails = ({ scene }: SceneDetailsProps) => {
  const intl = useIntl();
  const router = useRouter();
  const {
    data,
    error,
    mutate: revalidate,
  } = useSWR<SceneDetailsType>(`/api/v1/scene/${router.query.sceneId}`, {
    fallbackData: scene,
  });

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={404} />;
  }

  // Only what the scanner/library actually linked; no guessed Stash urls.
  const mediaLinks: PlayButtonLink[] = data.mediaInfo?.mediaUrl
    ? [
        {
          text: intl.formatMessage(messages.play),
          url: data.mediaInfo.mediaUrl,
          svg: <PlayIcon />,
        },
      ]
    : [];

  const attributes: React.ReactNode[] = [];
  if (data.site) {
    attributes.push(
      <Link href={`/site/${data.site.id}`} className="hover:underline">
        {data.site.name}
      </Link>
    );
  }
  if (data.releaseDate) {
    attributes.push(
      intl.formatDate(data.releaseDate, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      })
    );
  }
  if (data.duration) {
    attributes.push(
      intl.formatMessage(messages.minutes, {
        minutes: Math.round(data.duration / 60),
      })
    );
  }

  return (
    <div className="media-page">
      {data.backdropPath && (
        <div className="media-page-bg-image">
          <CachedImage
            type="tpdb"
            alt=""
            src={data.backdropPath}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            fill
            priority
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(180deg, rgba(17, 24, 39, 0.47) 0%, rgba(17, 24, 39, 1) 100%)',
            }}
          />
        </div>
      )}
      <PageTitle title={data.title} />
      <div className="media-header">
        <div className="media-poster">
          <CachedImage
            type="tpdb"
            src={data.posterPath ?? '/images/seerr_poster_not_found.png'}
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
            {/* ponytail: no mediaType passed — StatusBadge's manage/arr links
                are movie/tv only. Status pill + download progress still work. */}
            <StatusBadge
              status={data.mediaInfo?.status}
              downloadItem={data.mediaInfo?.downloadStatus}
              title={data.title}
              mediaType="scene"
              tmdbId={data.id}
              inProgress={(data.mediaInfo?.downloadStatus ?? []).length > 0}
            />
          </div>
          <h1 data-testid="media-title">
            {data.title}{' '}
            {data.releaseDate && (
              <span className="media-year">
                ({data.releaseDate.slice(0, 4)})
              </span>
            )}
          </h1>
          <span className="media-attributes">
            {attributes
              .map((t, k) => <span key={k}>{t}</span>)
              .reduce((prev, curr) => (
                <Fragment key={`${prev.key}-${curr.key}`}>
                  {prev} | {curr}
                </Fragment>
              ))}
          </span>
        </div>
        <div className="media-actions">
          <div className="z-20">
            <PlayButton links={mediaLinks} />
          </div>
          <RequestButton
            mediaType="scene"
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
            {data.overview
              ? data.overview
              : intl.formatMessage(messages.overviewunavailable)}
          </p>
          {data.tags.length > 0 && (
            <div className="mt-6">
              <h2>{intl.formatMessage(messages.tags)}</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-200 ring-1 ring-gray-700"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="media-overview-right">
          <div className="media-facts">
            {data.site && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.site)}</span>
                <span className="media-fact-value">
                  <Link
                    href={`/site/${data.site.id}`}
                    className="hover:underline"
                  >
                    {data.site.name}
                  </Link>
                </span>
              </div>
            )}
            {data.releaseDate && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.releasedate)}</span>
                <span className="media-fact-value">
                  {intl.formatDate(data.releaseDate, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    timeZone: 'UTC',
                  })}
                </span>
              </div>
            )}
            {data.duration ? (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.duration)}</span>
                <span className="media-fact-value">
                  {intl.formatMessage(messages.minutes, {
                    minutes: Math.round(data.duration / 60),
                  })}
                </span>
              </div>
            ) : null}
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
      {data.performers.length > 0 && (
        <>
          <div className="slider-header">
            <div className="slider-title">
              <span>{intl.formatMessage(messages.performers)}</span>
            </div>
          </div>
          <ul className="cards-vertical">
            {data.performers.map((performer) => (
              <li key={`performer-${performer.id}-${performer.name}`}>
                <PersonCard
                  personId={performer.id}
                  href={
                    performer.id === 0
                      ? `/search?query=${encodeURIComponent(performer.name)}`
                      : undefined
                  }
                  name={performer.name}
                  profilePath={performer.posterPath}
                  canExpand
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};

export default SceneDetails;
