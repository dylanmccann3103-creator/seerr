import Button from '@app/components/Common/Button';
import SlideOver from '@app/components/Common/SlideOver';
import type {
  SceneFilterOptions,
  TagRef,
} from '@app/components/Discover/constants';
import {
  countActiveFilters,
  serializeTagParam,
} from '@app/components/Discover/constants';
import { useBatchUpdateQueryParams } from '@app/hooks/useUpdateQueryParams';
import defineMessages from '@app/utils/defineMessages';
import { XCircleIcon } from '@heroicons/react/24/outline';
import type { SiteResult } from '@server/models/Site';
import axios from 'axios';
import { useIntl } from 'react-intl';
import AsyncSelect from 'react-select/async';

const messages = defineMessages('components.Discover.SceneFilterSlideover', {
  filters: 'Filters',
  activefilters:
    '{count, plural, one {# Active Filter} other {# Active Filters}}',
  tags: 'Tags',
  searchTags: 'Search tags…',
  site: 'Site',
  searchSites: 'Search sites…',
  year: 'Year',
  starttyping: 'Start typing to search.',
  nooptions: 'No results.',
  clearfilters: 'Clear Active Filters',
});

type Option = { label: string; value: number };

type SceneFilterSlideoverProps = {
  show: boolean;
  onClose: () => void;
  currentFilters: SceneFilterOptions;
  tags: TagRef[];
  siteName?: string;
};

const SceneFilterSlideover = ({
  show,
  onClose,
  currentFilters,
  tags,
  siteName,
}: SceneFilterSlideoverProps) => {
  const intl = useIntl();
  const batchUpdateQueryParams = useBatchUpdateQueryParams({});

  const loadTags = async (inputValue: string): Promise<Option[]> => {
    const { data } = await axios.get<{ results: TagRef[] }>('/api/v1/tags', {
      // The API validator rejects an empty `query`; axios encodes the value.
      params: inputValue ? { query: inputValue } : {},
    });
    return data.results.map((t) => ({ label: t.name, value: t.id }));
  };

  const loadSites = async (inputValue: string): Promise<Option[]> => {
    if (!inputValue) return [];
    const { data } = await axios.get<{ results: SiteResult[] }>(
      '/api/v1/search',
      { params: inputValue ? { query: inputValue } : {} }
    );
    return data.results
      .filter((r) => r.mediaType === 'site')
      .map((s) => ({ label: s.name, value: s.id }));
  };

  const noOptions = ({ inputValue }: { inputValue: string }) =>
    intl.formatMessage(inputValue ? messages.nooptions : messages.starttyping);

  return (
    <SlideOver
      show={show}
      title={intl.formatMessage(messages.filters)}
      subText={intl.formatMessage(messages.activefilters, {
        count: countActiveFilters(currentFilters),
      })}
      onClose={onClose}
    >
      <div className="flex flex-col space-y-4">
        <span className="text-lg font-semibold">
          {intl.formatMessage(messages.tags)}
        </span>
        <AsyncSelect
          key={`tags-${currentFilters.tags ?? ''}`}
          className="react-select-container"
          classNamePrefix="react-select"
          isMulti
          defaultValue={tags.map((t) => ({ label: t.name, value: t.id }))}
          defaultOptions
          cacheOptions
          isClearable
          noOptionsMessage={noOptions}
          loadOptions={loadTags}
          placeholder={intl.formatMessage(messages.searchTags)}
          onChange={(value) =>
            batchUpdateQueryParams({
              tags: serializeTagParam(
                (value ?? []).map((v) => ({ id: v.value, name: v.label }))
              ),
            })
          }
        />
        <span className="text-lg font-semibold">
          {intl.formatMessage(messages.site)}
        </span>
        <AsyncSelect
          key={`site-${currentFilters.siteId ?? ''}`}
          className="react-select-container"
          classNamePrefix="react-select"
          defaultValue={
            currentFilters.siteId && siteName
              ? { label: siteName, value: Number(currentFilters.siteId) }
              : null
          }
          cacheOptions
          isClearable
          noOptionsMessage={noOptions}
          loadOptions={loadSites}
          placeholder={intl.formatMessage(messages.searchSites)}
          onChange={(value) =>
            batchUpdateQueryParams({
              siteId: value ? String(value.value) : undefined,
              siteName: value ? value.label : undefined,
            })
          }
        />
        <span className="text-lg font-semibold">
          {intl.formatMessage(messages.year)}
        </span>
        <input
          type="number"
          min={1990}
          max={new Date().getFullYear() + 1}
          value={currentFilters.year ?? ''}
          onChange={(e) =>
            batchUpdateQueryParams({ year: e.target.value || undefined })
          }
        />
        <div className="pt-4">
          <Button
            className="w-full"
            disabled={countActiveFilters(currentFilters) === 0}
            onClick={() => {
              batchUpdateQueryParams({
                tags: undefined,
                siteId: undefined,
                siteName: undefined,
                year: undefined,
              });
              onClose();
            }}
          >
            <XCircleIcon />
            <span>{intl.formatMessage(messages.clearfilters)}</span>
          </Button>
        </div>
      </div>
    </SlideOver>
  );
};

export default SceneFilterSlideover;
