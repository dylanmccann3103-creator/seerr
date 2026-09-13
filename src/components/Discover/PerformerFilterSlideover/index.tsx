import Button from '@app/components/Common/Button';
import SlideOver from '@app/components/Common/SlideOver';
import type { PerformerFilterOptions } from '@app/components/Discover/constants';
import {
  countActiveFilters,
  performerFilterValues,
} from '@app/components/Discover/constants';
import { useBatchUpdateQueryParams } from '@app/hooks/useUpdateQueryParams';
import defineMessages from '@app/utils/defineMessages';
import { XCircleIcon } from '@heroicons/react/24/outline';
import { useIntl } from 'react-intl';

const messages = defineMessages(
  'components.Discover.PerformerFilterSlideover',
  {
    filters: 'Filters',
    activefilters:
      '{count, plural, one {# Active Filter} other {# Active Filters}}',
    gender: 'Gender',
    ethnicity: 'Ethnicity',
    hairColour: 'Hair Colour',
    eyeColour: 'Eye Colour',
    any: 'Any',
    clearfilters: 'Clear Active Filters',
  }
);

const fields = ['gender', 'ethnicity', 'hairColour', 'eyeColour'] as const;

type PerformerFilterSlideoverProps = {
  show: boolean;
  onClose: () => void;
  currentFilters: PerformerFilterOptions;
};

const PerformerFilterSlideover = ({
  show,
  onClose,
  currentFilters,
}: PerformerFilterSlideoverProps) => {
  const intl = useIntl();
  const batchUpdateQueryParams = useBatchUpdateQueryParams({});

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
        {fields.map((field) => (
          <div key={field} className="flex flex-col space-y-2">
            <span className="text-lg font-semibold">
              {intl.formatMessage(messages[field])}
            </span>
            <select
              value={currentFilters[field] ?? ''}
              onChange={(e) =>
                batchUpdateQueryParams({
                  [field]: e.target.value || undefined,
                })
              }
            >
              <option value="">{intl.formatMessage(messages.any)}</option>
              {performerFilterValues[field].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        ))}
        <div className="pt-4">
          <Button
            className="w-full"
            disabled={countActiveFilters(currentFilters) === 0}
            onClick={() => {
              batchUpdateQueryParams({
                gender: undefined,
                ethnicity: undefined,
                hairColour: undefined,
                eyeColour: undefined,
                letter: undefined,
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

export default PerformerFilterSlideover;
