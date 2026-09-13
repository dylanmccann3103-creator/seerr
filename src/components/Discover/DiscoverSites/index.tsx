import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import PageTitle from '@app/components/Common/PageTitle';
import useDiscover from '@app/hooks/useDiscover';
import { useUpdateQueryParams } from '@app/hooks/useUpdateQueryParams';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { SiteResult } from '@server/models/Site';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Discover.DiscoverSites', {
  title: 'Sites',
  all: 'All',
});

const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');

// TPDB lists sites alphabetically and only filters on `letter`, so the
// letter bar is the whole filter UI.
const DiscoverSites = () => {
  const intl = useIntl();
  const router = useRouter();
  const updateQueryParams = useUpdateQueryParams({});
  const letter = Array.isArray(router.query.letter)
    ? router.query.letter[0]
    : router.query.letter;

  const {
    isLoadingInitialData,
    isEmpty,
    isLoadingMore,
    isReachingEnd,
    titles,
    fetchMore,
    error,
  } = useDiscover<SiteResult, unknown, { letter?: string }>(
    '/api/v1/discover/sites',
    letter ? { letter } : {}
  );

  if (error) {
    return <ErrorPage statusCode={500} />;
  }

  const title = intl.formatMessage(messages.title);
  const letterClass = (active: boolean) =>
    `rounded px-2 py-1 text-sm uppercase transition ${
      active
        ? 'bg-indigo-600 text-white'
        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
    }`;

  return (
    <>
      <PageTitle title={title} />
      <div className="mb-4">
        <Header>{title}</Header>
      </div>
      <div className="mb-4 flex flex-wrap gap-1">
        <button
          type="button"
          className={letterClass(!letter)}
          onClick={() => updateQueryParams('letter', undefined)}
        >
          {intl.formatMessage(messages.all)}
        </button>
        {letters.map((l) => (
          <button
            key={l}
            type="button"
            className={letterClass(letter === l)}
            onClick={() => updateQueryParams('letter', l)}
          >
            {l}
          </button>
        ))}
      </div>
      <ListView
        items={titles}
        isEmpty={isEmpty}
        isLoading={
          isLoadingInitialData || (isLoadingMore && (titles?.length ?? 0) > 0)
        }
        isReachingEnd={isReachingEnd}
        onScrollBottom={fetchMore}
      />
    </>
  );
};

export default DiscoverSites;
