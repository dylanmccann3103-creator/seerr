import SlideCheckbox from '@app/components/Common/SlideCheckbox';
import Tooltip from '@app/components/Common/Tooltip';
import { sliderTitles } from '@app/components/Discover/constants';
import defineMessages from '@app/utils/defineMessages';
import {
  Bars3Icon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/solid';
import { DiscoverSliderType } from '@server/constants/discover';
import type DiscoverSlider from '@server/entity/DiscoverSlider';
import { useRef, useState } from 'react';
import { useDrag, useDrop } from 'react-aria';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Discover.DiscoverSliderEdit', {
  enable: 'Toggle Visibility',
});

const Position = {
  None: 'None',
  Above: 'Above',
  Below: 'Below',
} as const;

type DiscoverSliderEditProps = {
  slider: Partial<DiscoverSlider>;
  onEnable: () => void;
  onPositionUpdate: (
    updatedItemId: number,
    position: keyof typeof Position,
    isClickable: boolean
  ) => void;
  children: React.ReactNode;
  disableUpButton: boolean;
  disableDownButton: boolean;
};

const DiscoverSliderEdit = ({
  slider,
  children,
  onEnable,
  onPositionUpdate,
  disableUpButton,
  disableDownButton,
}: DiscoverSliderEditProps) => {
  const intl = useIntl();
  const ref = useRef<HTMLDivElement>(null);
  const [hoverPosition, setHoverPosition] = useState<keyof typeof Position>(
    Position.None
  );

  const { dragProps, isDragging } = useDrag({
    getItems() {
      return [{ id: (slider.id ?? -1).toString(), title: slider.title ?? '' }];
    },
  });

  const { dropProps } = useDrop({
    ref,
    onDropMove: (e) => {
      if (ref.current) {
        const middlePoint = ref.current.offsetHeight / 2;

        if (e.y < middlePoint) {
          setHoverPosition(Position.Above);
        } else {
          setHoverPosition(Position.Below);
        }
      }
    },
    onDropExit: () => {
      setHoverPosition(Position.None);
    },
    onDrop: async (e) => {
      const items = await Promise.all(
        e.items
          .filter((item) => item.kind === 'text' && item.types.has('id'))
          .map(async (item) => {
            if (item.kind === 'text') {
              return item.getText('id');
            }
          })
      );
      if (items?.[0]) {
        const dropped = Number(items[0]);
        onPositionUpdate(dropped, hoverPosition, false);
      }
    },
  });

  const getSliderTitle = (slider: Partial<DiscoverSlider>): string => {
    switch (slider.type) {
      case DiscoverSliderType.RECENT_SCENES:
        return intl.formatMessage(sliderTitles.recentscenes);
      case DiscoverSliderType.SITES:
        return intl.formatMessage(sliderTitles.sites);
      case DiscoverSliderType.PERFORMERS:
        return intl.formatMessage(sliderTitles.performers);
      case DiscoverSliderType.RECENTLY_ADDED:
        return intl.formatMessage(sliderTitles.recentlyAdded);
      case DiscoverSliderType.RECENT_REQUESTS:
        return intl.formatMessage(sliderTitles.recentrequests);
      default:
        return 'Unknown Slider';
    }
  };

  return (
    <div
      key={`discover-slider-${slider.id}-editing`}
      data-testid="discover-slider-edit-mode"
      className={`relative mb-4 rounded-lg bg-gray-800 shadow-md ${
        isDragging ? 'opacity-0' : 'opacity-100'
      }`}
      {...dragProps}
      {...dropProps}
      ref={ref}
    >
      {hoverPosition === Position.Above && (
        <div
          className={`absolute -top-3 left-0 w-full border-t-4 border-indigo-500`}
        />
      )}
      {hoverPosition === Position.Below && (
        <div
          className={`absolute -bottom-2 left-0 w-full border-t-4 border-indigo-500`}
        />
      )}
      <div className="flex w-full flex-col rounded-t-lg border-l border-r border-t border-gray-800 bg-gray-900 p-4 text-gray-400 md:flex-row md:items-center md:space-x-2">
        <div className="mb-0 flex space-x-2">
          <Bars3Icon className="h-6 w-6" />
          <div className="w-7/12 truncate md:w-full">
            {getSliderTitle(slider)}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="absolute right-14 top-4 flex px-2 md:relative md:right-0 md:top-0">
            <button
              className={'hover:text-white disabled:text-gray-800'}
              onClick={() =>
                onPositionUpdate(Number(slider.id), Position.Above, true)
              }
              disabled={disableUpButton}
            >
              <ChevronUpIcon className="h-7 w-7 md:h-6 md:w-6" />
            </button>
            <button
              className={'hover:text-white disabled:text-gray-800'}
              onClick={() =>
                onPositionUpdate(Number(slider.id), Position.Below, true)
              }
              disabled={disableDownButton}
            >
              <ChevronDownIcon className="h-7 w-7 md:h-6 md:w-6" />
            </button>
          </div>
          <div className="absolute right-4 top-4 flex-1 text-right md:relative md:right-0 md:top-0">
            <Tooltip content={intl.formatMessage(messages.enable)}>
              <div>
                <SlideCheckbox
                  onClick={() => {
                    onEnable();
                  }}
                  checked={slider.enabled}
                />
              </div>
            </Tooltip>
          </div>
        </div>
      </div>
      <div className={`-mt-6 p-4 ${!slider.enabled ? 'opacity-50' : ''}`}>
        {children}
      </div>
    </div>
  );
};

export default DiscoverSliderEdit;
