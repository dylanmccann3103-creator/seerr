import Button from '@app/components/Common/Button';
import ConfirmButton from '@app/components/Common/ConfirmButton';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import Tooltip from '@app/components/Common/Tooltip';
import DiscoverSliderEdit from '@app/components/Discover/DiscoverSliderEdit';
import RecentRequestsSlider from '@app/components/Discover/RecentRequestsSlider';
import RecentlyAddedSlider from '@app/components/Discover/RecentlyAddedSlider';
import { sliderTitles } from '@app/components/Discover/constants';
import MediaSlider from '@app/components/MediaSlider';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import {
  ArrowDownOnSquareIcon,
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  PencilIcon,
} from '@heroicons/react/24/solid';
import { DiscoverSliderType } from '@server/constants/discover';
import type DiscoverSlider from '@server/entity/DiscoverSlider';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Discover', {
  discover: 'Discover',
  resettodefault: 'Reset to Default',
  resetwarning:
    'Reset all sliders to default. This will also delete any custom sliders!',
  updatesuccess: 'Updated discover customization settings.',
  updatefailed:
    'Something went wrong updating the discover customization settings.',
  resetsuccess: 'Sucessfully reset discover customization settings.',
  resetfailed:
    'Something went wrong resetting the discover customization settings.',
  customizediscover: 'Customize Discover',
  stopediting: 'Stop Editing',
});

const Discover = () => {
  const intl = useIntl();
  const { hasPermission } = useUser();
  const { addToast } = useToasts();
  const {
    data: discoverData,
    error: discoverError,
    mutate,
  } = useSWR<DiscoverSlider[]>('/api/v1/settings/discover');
  const [sliders, setSliders] = useState<Partial<DiscoverSlider>[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  // We need to sync the state here so that we can modify the changes locally without commiting
  // anything to the server until the user decides to save the changes
  useEffect(() => {
    if (discoverData && !isEditing) {
      setSliders(discoverData);
    }
  }, [discoverData, isEditing]);

  const hasChanged = () => !Object.is(discoverData, sliders);

  const updateSliders = async () => {
    try {
      await axios.post('/api/v1/settings/discover', sliders);

      addToast(intl.formatMessage(messages.updatesuccess), {
        appearance: 'success',
        autoDismiss: true,
      });
      setIsEditing(false);
      mutate();
    } catch {
      addToast(intl.formatMessage(messages.updatefailed), {
        appearance: 'error',
        autoDismiss: true,
      });
    }
  };

  const resetSliders = async () => {
    try {
      await axios.get('/api/v1/settings/discover/reset');

      addToast(intl.formatMessage(messages.resetsuccess), {
        appearance: 'success',
        autoDismiss: true,
      });
      setIsEditing(false);
      mutate();
    } catch {
      addToast(intl.formatMessage(messages.resetfailed), {
        appearance: 'error',
        autoDismiss: true,
      });
    }
  };

  if (!discoverData && !discoverError) {
    return <LoadingSpinner />;
  }

  return (
    <>
      <PageTitle title={intl.formatMessage(messages.discover)} />
      {hasPermission(Permission.ADMIN) && (
        <>
          <Transition
            as="div"
            show={!isEditing}
            enter="transition-opacity duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
            className="absolute-bottom-shift fixed right-6 z-50 flex items-center sm:bottom-8"
          >
            <button
              onClick={() => setIsEditing(true)}
              data-testid="discover-start-editing"
              className="h-12 w-12 rounded-full border-2 border-gray-600 bg-gray-700/90 p-3 text-gray-400 shadow transition-all hover:bg-gray-700"
            >
              <PencilIcon className="h-full w-full" />
            </button>
          </Transition>
          <Transition
            as="div"
            show={isEditing}
            enter="transition duration-300"
            enterFrom="opacity-0 translate-y-6"
            enterTo="opacity-100 translate-y-0"
            leave="transition duration-300"
            leaveFrom="opacity-100 translate-y-0"
            leaveTo="opacity-0 translate-y-6"
            className="safe-shift-edit-menu fixed left-0 right-0 z-50 flex flex-col items-center justify-end space-x-0 space-y-2 border-t border-gray-700 bg-gray-800/80 p-4 backdrop-blur sm:bottom-0 sm:flex-row sm:space-x-3 sm:space-y-0"
          >
            <Button
              buttonType="default"
              onClick={() => setIsEditing(false)}
              className="w-full sm:w-auto"
            >
              <ArrowUturnLeftIcon />
              <span>{intl.formatMessage(messages.stopediting)}</span>
            </Button>
            <Tooltip content={intl.formatMessage(messages.resetwarning)}>
              <ConfirmButton
                onClick={() => resetSliders()}
                confirmText={intl.formatMessage(globalMessages.areyousure)}
                className="w-full sm:w-auto"
              >
                <ArrowPathIcon />
                <span>{intl.formatMessage(messages.resettodefault)}</span>
              </ConfirmButton>
            </Tooltip>
            <Button
              buttonType="primary"
              type="submit"
              disabled={!hasChanged()}
              onClick={() => updateSliders()}
              data-testid="discover-customize-submit"
              className="w-full sm:w-auto"
            >
              <ArrowDownOnSquareIcon />
              <span>{intl.formatMessage(globalMessages.save)}</span>
            </Button>
          </Transition>
        </>
      )}
      {(isEditing ? sliders : discoverData)?.map((slider, index) => {
        let sliderComponent: React.ReactNode;

        switch (slider.type) {
          case DiscoverSliderType.RECENT_SCENES:
            sliderComponent = (
              <MediaSlider
                sliderKey="recent-scenes"
                title={intl.formatMessage(sliderTitles.recentscenes)}
                url="/api/v1/discover/scenes"
                linkUrl="/discover/scenes"
              />
            );
            break;
          case DiscoverSliderType.SITES:
            sliderComponent = (
              <MediaSlider
                sliderKey="sites"
                title={intl.formatMessage(sliderTitles.sites)}
                url="/api/v1/discover/sites"
                linkUrl="/discover/sites"
              />
            );
            break;
          case DiscoverSliderType.PERFORMERS:
            sliderComponent = (
              <MediaSlider
                sliderKey="performers"
                title={intl.formatMessage(sliderTitles.performers)}
                url="/api/v1/discover/performers"
                linkUrl="/discover/performers"
              />
            );
            break;
          case DiscoverSliderType.RECENTLY_ADDED:
            sliderComponent = <RecentlyAddedSlider />;
            break;
          case DiscoverSliderType.RECENT_REQUESTS:
            sliderComponent = <RecentRequestsSlider />;
            break;
        }

        if (isEditing) {
          return (
            <DiscoverSliderEdit
              key={`discover-slider-${slider.id}-edit`}
              slider={slider}
              onEnable={() => {
                const tempSliders = sliders.slice();
                tempSliders[index].enabled = !tempSliders[index].enabled;
                setSliders(tempSliders);
              }}
              onPositionUpdate={(updatedItemId, position, hasClickedArrows) => {
                const originalPosition = sliders.findIndex(
                  (item) => item.id === updatedItemId
                );
                const originalItem = sliders[originalPosition];

                const tempSliders = sliders.slice();

                tempSliders.splice(originalPosition, 1);
                if (hasClickedArrows) {
                  tempSliders.splice(
                    position === 'Above' ? index - 1 : index + 1,
                    0,
                    originalItem
                  );
                } else {
                  tempSliders.splice(
                    position === 'Above' && index > originalPosition
                      ? Math.max(index - 1, 0)
                      : index,
                    0,
                    originalItem
                  );
                }

                setSliders(tempSliders);
              }}
              disableUpButton={index === 0}
              disableDownButton={index === sliders.length - 1}
            >
              {sliderComponent}
            </DiscoverSliderEdit>
          );
        }

        if (!slider.enabled) {
          return null;
        }

        return (
          <div key={`discover-slider-${slider.id}`}>{sliderComponent}</div>
        );
      })}
    </>
  );
};

export default Discover;
