import Header from '@app/components/Common/Header';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import type { TagRef } from '@app/components/Discover/constants';
import { serializeTagParam } from '@app/components/Discover/constants';
import useDebouncedState from '@app/hooks/useDebouncedState';
import useDiscover from '@app/hooks/useDiscover';
import useVerticalScroll from '@app/hooks/useVerticalScroll';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import Link from 'next/link';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Discover.DiscoverCategories', {
  title: 'Categories',
  searchPlaceholder: 'Search categories…',
  noresults: 'No categories found.',
});

type TagResult = TagRef & { mediaType: 'tag' };

const DiscoverCategories = () => {
  const intl = useIntl();
  const [query, debouncedQuery, setQuery] = useDebouncedState('');

  const {
    isLoadingInitialData,
    isLoadingMore,
    isEmpty,
    isReachingEnd,
    titles,
    fetchMore,
    error,
  } = useDiscover<TagResult, unknown, { query?: string }>(
    '/api/v1/tags',
    debouncedQuery ? { query: debouncedQuery } : {}
  );

  // Same infinite-scroll trigger ListView uses; an in-view sentinel re-fires
  // on every render and loops on setSize.
  useVerticalScroll(fetchMore, !isLoadingMore && !isEmpty && !isReachingEnd);

  if (error) {
    return <ErrorPage statusCode={500} />;
  }

  const title = intl.formatMessage(messages.title);

  return (
    <>
      <PageTitle title={title} />
      <div className="mb-4 flex flex-col justify-between lg:flex-row lg:items-end">
        <Header>{title}</Header>
        <div className="relative mt-2 flex flex-grow lg:max-w-md lg:flex-grow-0">
          <span className="inline-flex items-center rounded-l-md border border-r-0 border-gray-500 bg-gray-800 px-3 text-gray-100">
            <MagnifyingGlassIcon className="h-5 w-5" />
          </span>
          <input
            type="search"
            className="rounded-r-only"
            placeholder={intl.formatMessage(messages.searchPlaceholder)}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      {isLoadingInitialData ? (
        <LoadingSpinner />
      ) : isEmpty ? (
        <div className="mt-16 text-center text-2xl text-gray-400">
          {intl.formatMessage(messages.noresults)}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {titles.map((tag) => (
            <li key={tag.id}>
              <Link
                href={`/discover/scenes?tags=${encodeURIComponent(
                  serializeTagParam([tag]) ?? ''
                )}`}
                className="flex h-20 items-center justify-center rounded-lg bg-gray-800 p-2 text-center font-bold text-white ring-1 ring-gray-700 transition hover:bg-gray-700 hover:ring-gray-500"
              >
                {tag.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
};

export default DiscoverCategories;
