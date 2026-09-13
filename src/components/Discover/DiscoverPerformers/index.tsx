import Button from '@app/components/Common/Button';
import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import PageTitle from '@app/components/Common/PageTitle';
import type { PerformerFilterOptions } from '@app/components/Discover/constants';
import {
  countActiveFilters,
  performerSortOptions,
  preparePerformerFilters,
} from '@app/components/Discover/constants';
import PerformerFilterSlideover from '@app/components/Discover/PerformerFilterSlideover';
import useDiscover from '@app/hooks/useDiscover';
import { useUpdateQueryParams } from '@app/hooks/useUpdateQueryParams';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { BarsArrowDownIcon, FunnelIcon } from '@heroicons/react/24/solid';
import type { PerformerResult } from '@server/models/Performer';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Discover.DiscoverPerformers', {
  title: 'Performers',
  activefilters:
    '{count, plural, one {# Active Filter} other {# Active Filters}}',
  sort_most_relevant: 'Most Relevant',
  sort_asc_name: 'Name (A-Z)',
  sort_desc_name: 'Name (Z-A)',
  sort_recently_created: 'Recently Added to TPDB',
  sort_recently_updated: 'Recently Updated',
  sort_recently_birthed: 'Youngest',
  sort_reverse_birthed: 'Oldest',
});

const DiscoverPerformers = () => {
  const intl = useIntl();
  const router = useRouter();
  const updateQueryParams = useUpdateQueryParams({});
  const filters = preparePerformerFilters(router.query);
  const [showFilters, setShowFilters] = useState(false);

  const {
    isLoadingInitialData,
    isEmpty,
    isLoadingMore,
    isReachingEnd,
    titles,
    fetchMore,
    error,
  } = useDiscover<PerformerResult, unknown, PerformerFilterOptions>(
    '/api/v1/discover/performers',
    filters
  );

  if (error) {
    return <ErrorPage statusCode={500} />;
  }

  const title = intl.formatMessage(messages.title);

  return (
    <>
      <PageTitle title={title} />
      <div className="mb-4 flex flex-col justify-between lg:flex-row lg:items-end">
        <Header>{title}</Header>
        <div className="mt-2 flex flex-grow flex-col sm:flex-row lg:flex-grow-0">
          <div className="mb-2 flex flex-grow sm:mb-0 sm:mr-2 lg:flex-grow-0">
            <span className="inline-flex cursor-default items-center rounded-l-md border border-r-0 border-gray-500 bg-gray-800 px-3 text-gray-100 sm:text-sm">
              <BarsArrowDownIcon className="h-6 w-6" />
            </span>
            <select
              id="orderBy"
              name="orderBy"
              className="rounded-r-only"
              value={filters.orderBy ?? performerSortOptions[0]}
              onChange={(e) => updateQueryParams('orderBy', e.target.value)}
            >
              {performerSortOptions.map((option) => (
                <option key={option} value={option}>
                  {intl.formatMessage(messages[`sort_${option}`])}
                </option>
              ))}
            </select>
          </div>
          <PerformerFilterSlideover
            show={showFilters}
            onClose={() => setShowFilters(false)}
            currentFilters={filters}
          />
          <div className="mb-2 flex flex-grow sm:mb-0 lg:flex-grow-0">
            <Button onClick={() => setShowFilters(true)} className="w-full">
              <FunnelIcon />
              <span>
                {intl.formatMessage(messages.activefilters, {
                  count: countActiveFilters(filters),
                })}
              </span>
            </Button>
          </div>
        </div>
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

export default DiscoverPerformers;
