import Alert from '@app/components/Common/Alert';
import Modal from '@app/components/Common/Modal';
import QuotaDisplay from '@app/components/RequestModal/QuotaDisplay';
import useToasts from '@app/hooks/useToasts';
import { useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { MediaStatus } from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { NonFunctionProperties } from '@server/interfaces/api/common';
import type { QuotaResponse } from '@server/interfaces/api/userInterfaces';
import { Permission } from '@server/lib/permissions';
import type { SceneDetails } from '@server/models/Scene';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const messages = defineMessages('components.RequestModal', {
  requestadmin: 'This request will be approved automatically.',
  requestSuccess: '<strong>{title}</strong> requested successfully!',
  requestCancel: 'Request for <strong>{title}</strong> canceled.',
  requestscenetitle: 'Request Scene',
  approve: 'Approve Request',
  cancel: 'Cancel Request',
  pendingscenerequest: 'Pending Scene Request',
  requestfrom: "{username}'s request is pending approval.",
  requestApproved: 'Request for <strong>{title}</strong> approved!',
  requesterror: 'Something went wrong while submitting the request.',
  pendingapproval: 'Your request is pending approval.',
});

interface SceneRequestModalProps {
  tmdbId: number;
  editRequest?: NonFunctionProperties<MediaRequest>;
  onCancel?: () => void;
  onComplete?: (newStatus: MediaStatus) => void;
  onUpdating?: (isUpdating: boolean) => void;
}

// Movie modal minus the AdvancedRequester.
// ponytail: single Whisparr server with fixed profile/folder, so there is
// nothing to override per request; add AdvancedRequester back if a second
// server or per-request profiles ever land.
const SceneRequestModal = ({
  onCancel,
  onComplete,
  tmdbId,
  onUpdating,
  editRequest,
}: SceneRequestModalProps) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const { addToast } = useToasts();
  const { data, error } = useSWR<SceneDetails>(`/api/v1/scene/${tmdbId}`, {
    revalidateOnMount: true,
  });
  const intl = useIntl();
  const { user, hasPermission } = useUser();
  // Scenes draw on the movie quota (server-side mapping).
  const { data: quota } = useSWR<QuotaResponse>(
    user ? `/api/v1/user/${user.id}/quota` : null
  );

  useEffect(() => {
    onUpdating?.(isUpdating);
  }, [isUpdating, onUpdating]);

  const hasAutoApprove = hasPermission(
    [Permission.MANAGE_REQUESTS, Permission.AUTO_APPROVE],
    { type: 'or' }
  );

  const sendRequest = async () => {
    setIsUpdating(true);
    try {
      const response = await axios.post<MediaRequest>('/api/v1/request', {
        mediaId: data?.id,
        mediaType: 'scene',
      });
      mutate('/api/v1/request?filter=all&take=10&sort=modified&skip=0');
      mutate('/api/v1/request/count');

      if (response.data) {
        onComplete?.(
          hasAutoApprove ? MediaStatus.PROCESSING : MediaStatus.PENDING
        );
        addToast(
          <span>
            {intl.formatMessage(messages.requestSuccess, {
              title: data?.title,
              strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
            })}
          </span>,
          { appearance: 'success', autoDismiss: true }
        );
      }
    } catch {
      addToast(intl.formatMessage(messages.requesterror), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const cancelRequest = async () => {
    setIsUpdating(true);
    try {
      const response = await axios.delete(`/api/v1/request/${editRequest?.id}`);
      mutate('/api/v1/request?filter=all&take=10&sort=modified&skip=0');
      mutate('/api/v1/request/count');
      if (response.status === 204) {
        onComplete?.(MediaStatus.UNKNOWN);
        addToast(
          <span>
            {intl.formatMessage(messages.requestCancel, {
              title: data?.title,
              strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
            })}
          </span>,
          { appearance: 'success', autoDismiss: true }
        );
      }
    } catch {
      setIsUpdating(false);
    }
  };

  const approveRequest = async () => {
    setIsUpdating(true);
    try {
      await axios.post(`/api/v1/request/${editRequest?.id}/approve`);
      mutate('/api/v1/request?filter=all&take=10&sort=modified&skip=0');
      mutate('/api/v1/request/count');
      addToast(
        <span>
          {intl.formatMessage(messages.requestApproved, {
            title: data?.title,
            strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
          })}
        </span>,
        { appearance: 'success', autoDismiss: true }
      );
      onComplete?.(MediaStatus.PROCESSING);
    } catch {
      addToast(intl.formatMessage(messages.requesterror), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Edit mode: nothing to edit on a scene request (no overrides), so the
  // pending view only offers approve (managers) or cancel (owner).
  if (editRequest) {
    const isOwner = editRequest.requestedBy.id === user?.id;
    const canManage = hasPermission(Permission.MANAGE_REQUESTS);

    return (
      <Modal
        loading={!data && !error}
        backgroundClickable
        onCancel={onCancel}
        title={intl.formatMessage(messages.pendingscenerequest)}
        subTitle={data?.title}
        onOk={() => (canManage ? approveRequest() : cancelRequest())}
        okDisabled={isUpdating}
        okText={intl.formatMessage(
          canManage ? messages.approve : messages.cancel
        )}
        okButtonType={canManage ? 'success' : 'danger'}
        onSecondary={isOwner && canManage ? () => cancelRequest() : undefined}
        secondaryDisabled={isUpdating}
        secondaryText={
          isOwner && canManage ? intl.formatMessage(messages.cancel) : undefined
        }
        secondaryButtonType="danger"
        cancelText={intl.formatMessage(globalMessages.close)}
        backdrop={data?.backdropPath}
      >
        {isOwner
          ? intl.formatMessage(messages.pendingapproval)
          : intl.formatMessage(messages.requestfrom, {
              username: editRequest.requestedBy.displayName,
            })}
      </Modal>
    );
  }

  return (
    <Modal
      loading={(!data && !error) || !quota}
      backgroundClickable
      onCancel={onCancel}
      onOk={sendRequest}
      okDisabled={isUpdating || quota?.movie.restricted}
      title={intl.formatMessage(messages.requestscenetitle)}
      subTitle={data?.title}
      okText={
        isUpdating
          ? intl.formatMessage(globalMessages.requesting)
          : intl.formatMessage(globalMessages.request)
      }
      okButtonType={'primary'}
      backdrop={data?.backdropPath}
    >
      {hasAutoApprove && !quota?.movie.restricted && (
        <div className="mt-6">
          <Alert
            title={intl.formatMessage(messages.requestadmin)}
            type="info"
          />
        </div>
      )}
      {(quota?.movie.limit ?? 0) > 0 && (
        <QuotaDisplay mediaType="movie" quota={quota?.movie} />
      )}
    </Modal>
  );
};

export default SceneRequestModal;
