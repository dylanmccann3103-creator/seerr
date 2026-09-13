import ButtonWithDropdown from '@app/components/Common/ButtonWithDropdown';
import RequestModal from '@app/components/RequestModal';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import {
  CheckIcon,
  InformationCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import type Media from '@server/entity/Media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import axios from 'axios';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { mutate } from 'swr';

const messages = defineMessages('components.RequestButton', {
  viewrequest: 'View Request',
  requestmore: 'Request More',
  approverequest: 'Approve Request',
  declinerequest: 'Decline Request',
  approverequests:
    'Approve {requestCount, plural, one {Request} other {{requestCount} Requests}}',
  declinerequests:
    'Decline {requestCount, plural, one {Request} other {{requestCount} Requests}}',
});

interface ButtonOption {
  id: string;
  text: string;
  action: () => void;
  svg?: React.ReactNode;
}

interface RequestButtonProps {
  mediaType: 'movie' | 'tv' | 'scene' | 'site';
  onUpdate: () => void;
  tmdbId: number;
  media?: Media;
  isShowComplete?: boolean;
}

const RequestButton = ({
  tmdbId,
  onUpdate,
  media,
  mediaType,
  isShowComplete = false,
}: RequestButtonProps) => {
  const intl = useIntl();
  const { user, hasPermission } = useUser();
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [editRequest, setEditRequest] = useState(false);
  // scene ~ movie (one item), site ~ tv (year seasons).
  const isSingle = mediaType === 'movie' || mediaType === 'scene';
  const isSeasonal = mediaType === 'tv' || mediaType === 'site';
  const requestPermissions =
    mediaType === 'movie'
      ? [Permission.REQUEST, Permission.REQUEST_MOVIE]
      : mediaType === 'tv'
        ? [Permission.REQUEST, Permission.REQUEST_TV]
        : [Permission.REQUEST];

  // All pending requests
  const activeRequests = media?.requests.filter(
    (request) => request.status === MediaRequestStatus.PENDING
  );

  // Current user's pending request, or the first pending request
  const activeRequest = useMemo(() => {
    return activeRequests && activeRequests.length > 0
      ? (activeRequests.find(
          (request) => request.requestedBy.id === user?.id
        ) ?? activeRequests[0])
      : undefined;
  }, [activeRequests, user]);

  const modifyRequest = async (
    request: MediaRequest,
    type: 'approve' | 'decline'
  ) => {
    const response = await axios.post(`/api/v1/request/${request.id}/${type}`);

    if (response) {
      onUpdate();
      mutate('/api/v1/request/count');
    }
  };

  const modifyRequests = async (
    requests: MediaRequest[],
    type: 'approve' | 'decline'
  ): Promise<void> => {
    if (!requests) {
      return;
    }

    await Promise.all(
      requests.map(async (request) => {
        return axios.post(`/api/v1/request/${request.id}/${type}`);
      })
    );

    onUpdate();
    mutate('/api/v1/request/count');
  };

  const buttons: ButtonOption[] = [];

  // If there are pending requests, show request management options first
  if (activeRequest) {
    if (
      activeRequest &&
      (activeRequest.requestedBy.id === user?.id ||
        (activeRequests?.length === 1 &&
          hasPermission(Permission.MANAGE_REQUESTS)))
    ) {
      buttons.push({
        id: 'active-request',
        text: intl.formatMessage(messages.viewrequest),
        action: () => {
          setEditRequest(true);
          setShowRequestModal(true);
        },
        svg: <InformationCircleIcon />,
      });
    }

    if (
      activeRequest &&
      hasPermission(Permission.MANAGE_REQUESTS) &&
      isSingle
    ) {
      buttons.push(
        {
          id: 'approve-request',
          text: intl.formatMessage(messages.approverequest),
          action: () => {
            modifyRequest(activeRequest, 'approve');
          },
          svg: <CheckIcon />,
        },
        {
          id: 'decline-request',
          text: intl.formatMessage(messages.declinerequest),
          action: () => {
            modifyRequest(activeRequest, 'decline');
          },
          svg: <XMarkIcon />,
        }
      );
    } else if (
      activeRequests &&
      activeRequests.length > 0 &&
      hasPermission(Permission.MANAGE_REQUESTS) &&
      isSeasonal
    ) {
      buttons.push(
        {
          id: 'approve-request-batch',
          text: intl.formatMessage(messages.approverequests, {
            requestCount: activeRequests.length,
          }),
          action: () => {
            modifyRequests(activeRequests, 'approve');
          },
          svg: <CheckIcon />,
        },
        {
          id: 'decline-request-batch',
          text: intl.formatMessage(messages.declinerequests, {
            requestCount: activeRequests.length,
          }),
          action: () => {
            modifyRequests(activeRequests, 'decline');
          },
          svg: <XMarkIcon />,
        }
      );
    }
  }

  // Standard request button
  if (
    (!media ||
      media.status === MediaStatus.UNKNOWN ||
      (media.status === MediaStatus.DELETED && !activeRequest)) &&
    hasPermission(requestPermissions, { type: 'or' })
  ) {
    buttons.push({
      id: 'request',
      text: intl.formatMessage(globalMessages.request),
      action: () => {
        setEditRequest(false);
        setShowRequestModal(true);
      },
      svg: <ArrowDownTrayIcon />,
    });
  } else if (
    isSeasonal &&
    (!activeRequest || activeRequest.requestedBy.id !== user?.id) &&
    hasPermission(requestPermissions, { type: 'or' }) &&
    media &&
    media.status !== MediaStatus.BLOCKLISTED &&
    !isShowComplete
  ) {
    buttons.push({
      id: 'request-more',
      text: intl.formatMessage(messages.requestmore),
      action: () => {
        setEditRequest(false);
        setShowRequestModal(true);
      },
      svg: <ArrowDownTrayIcon />,
    });
  }

  const [buttonOne, ...others] = buttons;

  if (!buttonOne) {
    return null;
  }

  return (
    <>
      <RequestModal
        tmdbId={tmdbId}
        show={showRequestModal}
        type={mediaType as 'scene' | 'site'}
        editRequest={editRequest ? activeRequest : undefined}
        onComplete={() => {
          onUpdate();
          setShowRequestModal(false);
        }}
        onCancel={() => setShowRequestModal(false)}
      />
      <ButtonWithDropdown
        text={
          <>
            {buttonOne.svg}
            <span>{buttonOne.text}</span>
          </>
        }
        onClick={buttonOne.action}
        className="ml-2"
      >
        {others && others.length > 0
          ? others.map((button) => (
              <ButtonWithDropdown.Item
                onClick={button.action}
                key={`request-option-${button.id}`}
              >
                {button.svg}
                <span>{button.text}</span>
              </ButtonWithDropdown.Item>
            ))
          : null}
      </ButtonWithDropdown>
    </>
  );
};

export default RequestButton;
