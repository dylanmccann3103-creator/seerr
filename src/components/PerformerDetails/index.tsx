import Ellipsis from '@app/assets/ellipsis.svg';
import CachedImage from '@app/components/Common/CachedImage';
import ListView from '@app/components/Common/ListView';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import useDiscover from '@app/hooks/useDiscover';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { PerformerDetails as PerformerDetailsType } from '@server/models/Performer';
import type { SceneResult } from '@server/models/Scene';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import TruncateMarkup from 'react-truncate-markup';
import useSWR from 'swr';

const messages = defineMessages('components.PerformerDetails', {
  alsoknownas: 'Also Known As: {names}',
  scenes: 'Scenes',
});

const PerformerDetails = () => {
  const intl = useIntl();
  const router = useRouter();
  const [showBio, setShowBio] = useState(false);
  const { data, error } = useSWR<PerformerDetailsType>(
    `/api/v1/performer/${router.query.performerId}`
  );

  const scenes = useDiscover<SceneResult>(
    `/api/v1/performer/${router.query.performerId}/scenes`,
    undefined,
    { hideAvailable: false, hideBlocklisted: false, hideRequested: false }
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={404} />;
  }

  return (
    <>
      <PageTitle title={data.name} />
      <div
        className={`relative z-10 mb-8 mt-4 flex flex-col items-center lg:flex-row ${
          data.bio ? 'lg:items-start' : ''
        }`}
      >
        {data.posterPath && (
          <div className="relative mb-6 mr-0 h-36 w-36 flex-shrink-0 overflow-hidden rounded-full ring-1 ring-gray-700 lg:mb-0 lg:mr-6 lg:h-44 lg:w-44">
            <CachedImage
              type="tpdb"
              src={data.posterPath}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              fill
            />
          </div>
        )}
        <div className="w-full text-center text-gray-300 lg:text-left">
          <h1 className="text-3xl text-white lg:text-4xl">{data.name}</h1>
          {(data.aliases ?? []).length > 0 && (
            <div className="mb-2 mt-1 text-xs text-white sm:text-sm lg:text-base">
              {intl.formatMessage(messages.alsoknownas, {
                names: (data.aliases ?? []).reduce((prev, curr) =>
                  intl.formatMessage(globalMessages.delimitedlist, {
                    a: prev,
                    b: curr,
                  })
                ),
              })}
            </div>
          )}
          {data.bio && (
            <div className="relative text-left">
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
              <div
                className="group outline-none ring-0"
                onClick={() => setShowBio((show) => !show)}
                role="button"
                tabIndex={-1}
              >
                <TruncateMarkup
                  lines={showBio ? 200 : 6}
                  ellipsis={
                    <Ellipsis className="relative -top-0.5 ml-2 inline-block opacity-70 transition duration-300 group-hover:opacity-100" />
                  }
                >
                  <p className="pt-2 text-sm lg:text-base">{data.bio}</p>
                </TruncateMarkup>
              </div>
            </div>
          )}
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
    </>
  );
};

export default PerformerDetails;
