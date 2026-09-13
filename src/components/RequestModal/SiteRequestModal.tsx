import Alert from '@app/components/Common/Alert';
import Badge from '@app/components/Common/Badge';
import Modal from '@app/components/Common/Modal';
import QuotaDisplay from '@app/components/RequestModal/QuotaDisplay';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import { useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { NonFunctionProperties } from '@server/interfaces/api/common';
import type { QuotaResponse } from '@server/interfaces/api/userInterfaces';
import { Permission } from '@server/lib/permissions';
import type { SiteDetails } from '@server/models/Site';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const messages = defineMessages('components.RequestModal', {
  requestadmin: 'This request will be approved automatically.',
  requestSuccess: '<strong>{title}</strong> requested successfully!',
  requestsitetitle: 'Request Site',
  approve: 'Approve Request',
  cancel: 'Cancel Request',
  pendingsiterequest: 'Pending Site Request',
  requestfrom: "{username}'s request is pending approval.",
  requestyears:
    'Request {yearCount} {yearCount, plural, one {Year} other {Years}}',
  alreadyrequested: 'Already Requested',
  selectyear: 'Select Year(s)',
  year: 'Year',
  noyears: 'Whisparr lists no years for this site yet.',
  requestApproved: 'Request for <strong>{title}</strong> approved!',
  requestcancelled: 'Request for <strong>{title}</strong> canceled.',
  requesterror: 'Something went wrong while submitting the request.',
  errorediting: 'Something went wrong while editing the request.',
  pendingapproval: 'Your request is pending approval.',
});

interface SiteRequestModalProps {
  tmdbId: number;
  onCancel?: () => void;
  onComplete?: (newStatus: MediaStatus) => void;
  onUpdating?: (isUpdating: boolean) => void;
  editRequest?: NonFunctionProperties<MediaRequest>;
}

// Series modal with calendar years as seasons (PLAN.md D2), minus tvdb
// lookup, anime and the AdvancedRequester (single Whisparr server).
// ponytail: edit mode is approve/cancel only — PUT /request/:id has no
// site branch yet; add year editing there first if it is ever wanted.
const SiteRequestModal = ({
  onCancel,
  onComplete,
  tmdbId,
  onUpdating,
  editRequest,
}: SiteRequestModalProps) => {
  const settings = useSettings();
  const { addToast } = useToasts();
  const { data, error } = useSWR<SiteDetails>(`/api/v1/site/${tmdbId}`);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const intl = useIntl();
  const { user, hasPermission } = useUser();
  // Site years draw on the tv quota (server-side mapping).
  const { data: quota } = useSWR<QuotaResponse>(
    user ? `/api/v1/user/${user.id}/quota` : null
  );
  const partial = settings.currentSettings.partialRequestsEnabled;

  const currentlyRemaining = (quota?.tv.remaining ?? 0) - selectedYears.length;

  const allYears = (data?.seasons ?? []).map((s) => s.seasonNumber);

  const activeRequests = (data?.mediaInfo?.requests ?? []).filter(
    (request) =>
      request.status !== MediaRequestStatus.DECLINED &&
      request.status !== MediaRequestStatus.COMPLETED
  );

  const requestedYears = activeRequests.flatMap((request) =>
    request.seasons.map((s) => s.seasonNumber)
  );

  const takenYears = [
    ...requestedYears,
    ...(data?.mediaInfo?.seasons ?? [])
      .filter(
        (season) =>
          season.status !== MediaStatus.UNKNOWN &&
          season.status !== MediaStatus.DELETED
      )
      .map((season) => season.seasonNumber),
  ];

  const unrequestedYears = allYears.filter((y) => !takenYears.includes(y));

  const yearRequestStatus = (year: number): MediaRequestStatus | undefined =>
    activeRequests
      .flatMap((r) => r.seasons)
      .find(
        (s) =>
          s.seasonNumber === year && s.status !== MediaRequestStatus.COMPLETED
      )?.status;

  const mediaYearStatus = (year: number): MediaStatus | undefined =>
    data?.mediaInfo?.seasons.find(
      (s) =>
        s.seasonNumber === year &&
        s.status !== MediaStatus.UNKNOWN &&
        s.status !== MediaStatus.DELETED
    )?.status;

  const isSelected = (year: number) => selectedYears.includes(year);

  const toggleYear = (year: number) => {
    if (takenYears.includes(year)) {
      return;
    }
    if (quota?.tv.limit && currentlyRemaining <= 0 && !isSelected(year)) {
      return;
    }
    setSelectedYears((years) =>
      years.includes(year) ? years.filter((y) => y !== year) : [...years, year]
    );
  };

  const isAllYears = () =>
    unrequestedYears.length > 0 &&
    selectedYears.length === unrequestedYears.length;

  const toggleAllYears = () => {
    if (
      quota?.tv.limit &&
      (quota.tv.remaining ?? 0) < unrequestedYears.length
    ) {
      return;
    }
    setSelectedYears(isAllYears() ? [] : unrequestedYears);
  };

  const finish = (fn: () => void) => {
    mutate('/api/v1/request?filter=all&take=10&sort=modified&skip=0');
    mutate('/api/v1/request/count');
    fn();
  };

  const sendRequest = async () => {
    const years = partial ? [...selectedYears].sort() : unrequestedYears;
    if (years.length === 0) {
      return;
    }
    onUpdating?.(true);
    try {
      const response = await axios.post<MediaRequest>('/api/v1/request', {
        mediaId: data?.id,
        mediaType: 'site',
        seasons: years,
      });
      finish(() => {
        onComplete?.(response.data.media.status);
        addToast(
          <span>
            {intl.formatMessage(messages.requestSuccess, {
              title: data?.name,
              strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
            })}
          </span>,
          { appearance: 'success', autoDismiss: true }
        );
      });
    } catch {
      addToast(intl.formatMessage(messages.requesterror), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      onUpdating?.(false);
    }
  };

  const approveOrCancel = async (approve: boolean) => {
    if (!editRequest) {
      return;
    }
    onUpdating?.(true);
    try {
      if (approve) {
        await axios.post(`/api/v1/request/${editRequest.id}/approve`);
      } else {
        await axios.delete(`/api/v1/request/${editRequest.id}`);
      }
      finish(() => {
        addToast(
          <span>
            {intl.formatMessage(
              approve ? messages.requestApproved : messages.requestcancelled,
              {
                title: data?.name,
                strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
              }
            )}
          </span>,
          { appearance: 'success', autoDismiss: true }
        );
        onComplete?.(approve ? MediaStatus.PROCESSING : MediaStatus.UNKNOWN);
      });
    } catch {
      addToast(<span>{intl.formatMessage(messages.errorediting)}</span>, {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      onUpdating?.(false);
    }
  };

  const isOwner = editRequest && editRequest.requestedBy.id === user?.id;
  const canManage = hasPermission(Permission.MANAGE_REQUESTS);
  const hasAutoApprove = hasPermission(
    [Permission.MANAGE_REQUESTS, Permission.AUTO_APPROVE],
    { type: 'or' }
  );
  const overQuota =
    !!quota?.tv.limit &&
    !partial &&
    unrequestedYears.length > (quota?.tv.remaining ?? 0);

  return (
    <Modal
      loading={!data && !error}
      backgroundClickable
      onCancel={onCancel}
      onOk={() => (editRequest ? approveOrCancel(canManage) : sendRequest())}
      title={intl.formatMessage(
        editRequest ? messages.pendingsiterequest : messages.requestsitetitle
      )}
      subTitle={data?.name}
      okText={
        editRequest
          ? intl.formatMessage(canManage ? messages.approve : messages.cancel)
          : unrequestedYears.length === 0
            ? intl.formatMessage(messages.alreadyrequested)
            : !partial
              ? intl.formatMessage(globalMessages.request)
              : selectedYears.length === 0
                ? intl.formatMessage(messages.selectyear)
                : intl.formatMessage(messages.requestyears, {
                    yearCount: selectedYears.length,
                  })
      }
      okDisabled={
        editRequest
          ? false
          : overQuota ||
            unrequestedYears.length === 0 ||
            (partial && selectedYears.length === 0)
      }
      okButtonType={
        editRequest ? (canManage ? 'success' : 'danger') : 'primary'
      }
      cancelText={intl.formatMessage(
        editRequest ? globalMessages.close : globalMessages.cancel
      )}
      backdrop={data?.posterPath}
    >
      {editRequest
        ? isOwner
          ? intl.formatMessage(messages.pendingapproval)
          : intl.formatMessage(messages.requestfrom, {
              username: editRequest.requestedBy.displayName,
            })
        : null}
      {hasAutoApprove &&
        !overQuota &&
        unrequestedYears.length > 0 &&
        !editRequest && (
          <div className="mt-6">
            <Alert
              title={intl.formatMessage(messages.requestadmin)}
              type="info"
            />
          </div>
        )}
      {(quota?.tv.limit ?? 0) > 0 && (
        <QuotaDisplay
          mediaType="tv"
          quota={quota?.tv}
          remaining={overQuota ? 0 : currentlyRemaining}
          overLimit={overQuota ? unrequestedYears.length : undefined}
        />
      )}
      {allYears.length === 0 && !editRequest && (
        <div className="mt-6">
          <Alert title={intl.formatMessage(messages.noyears)} type="warning" />
        </div>
      )}
      <div className="flex flex-col">
        <div className="-mx-4 sm:mx-0">
          <div className="inline-block min-w-full py-2 align-middle">
            <div className="overflow-hidden border border-gray-700 shadow backdrop-blur sm:rounded-lg">
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th
                      className={`w-16 bg-gray-700/80 px-4 py-3 ${
                        (!partial || !!editRequest) && 'hidden'
                      }`}
                    >
                      <span
                        role="checkbox"
                        tabIndex={0}
                        aria-checked={isAllYears()}
                        onClick={() => toggleAllYears()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Space') {
                            toggleAllYears();
                          }
                        }}
                        className={`relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center justify-center pt-2 focus:outline-none ${
                          quota?.tv.limit &&
                          (quota.tv.remaining ?? 0) < unrequestedYears.length
                            ? 'opacity-50'
                            : ''
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`${
                            isAllYears() ? 'bg-indigo-500' : 'bg-gray-800'
                          } absolute mx-auto h-4 w-9 rounded-full transition-colors duration-200 ease-in-out`}
                        />
                        <span
                          aria-hidden="true"
                          className={`${
                            isAllYears() ? 'translate-x-5' : 'translate-x-0'
                          } absolute left-0 inline-block h-5 w-5 rounded-full border border-gray-200 bg-white shadow transition-transform duration-200 ease-in-out group-focus:border-blue-300 group-focus:ring`}
                        />
                      </span>
                    </th>
                    <th className="bg-gray-700/80 px-1 py-3 text-left text-xs font-medium uppercase leading-4 tracking-wider text-gray-200 md:px-6">
                      {intl.formatMessage(messages.year)}
                    </th>
                    <th className="bg-gray-700/80 px-2 py-3 text-left text-xs font-medium uppercase leading-4 tracking-wider text-gray-200 md:px-6">
                      {intl.formatMessage(globalMessages.status)}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {allYears.map((year) => {
                    const requestStatus = yearRequestStatus(year);
                    const mediaStatus = mediaYearStatus(year);
                    const editing = !!editRequest?.seasons.some(
                      (s) => s.seasonNumber === year
                    );
                    const checked =
                      !!mediaStatus ||
                      !!requestStatus ||
                      editing ||
                      isSelected(year);
                    return (
                      <tr key={`year-${year}`}>
                        <td
                          className={`whitespace-nowrap px-4 py-4 text-sm font-medium leading-5 text-gray-100 ${
                            (!partial || !!editRequest) && 'hidden'
                          }`}
                        >
                          <span
                            role="checkbox"
                            tabIndex={0}
                            aria-checked={checked}
                            onClick={() => toggleYear(year)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'Space') {
                                toggleYear(year);
                              }
                            }}
                            className={`relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center justify-center pt-2 focus:outline-none ${
                              takenYears.includes(year) ||
                              (quota?.tv.limit &&
                                currentlyRemaining <= 0 &&
                                !isSelected(year))
                                ? 'opacity-50'
                                : ''
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className={`${
                                checked ? 'bg-indigo-500' : 'bg-gray-700'
                              } absolute mx-auto h-4 w-9 rounded-full transition-colors duration-200 ease-in-out`}
                            />
                            <span
                              aria-hidden="true"
                              className={`${
                                checked ? 'translate-x-5' : 'translate-x-0'
                              } absolute left-0 inline-block h-5 w-5 rounded-full border border-gray-200 bg-white shadow transition-transform duration-200 ease-in-out group-focus:border-blue-300 group-focus:ring`}
                            />
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-1 py-4 text-sm font-medium leading-5 text-gray-100 md:px-6">
                          {year}
                        </td>
                        <td className="whitespace-nowrap py-4 pr-2 text-sm leading-5 text-gray-200 md:px-6">
                          {!requestStatus && !mediaStatus && !editing && (
                            <Badge>
                              {intl.formatMessage(globalMessages.notrequested)}
                            </Badge>
                          )}
                          {!mediaStatus &&
                            (requestStatus === MediaRequestStatus.PENDING ||
                              editing) && (
                              <Badge badgeType="warning">
                                {intl.formatMessage(globalMessages.pending)}
                              </Badge>
                            )}
                          {((!mediaStatus &&
                            requestStatus === MediaRequestStatus.APPROVED) ||
                            mediaStatus === MediaStatus.PROCESSING) && (
                            <Badge badgeType="primary">
                              {intl.formatMessage(globalMessages.requested)}
                            </Badge>
                          )}
                          {mediaStatus === MediaStatus.PARTIALLY_AVAILABLE && (
                            <Badge badgeType="success">
                              {intl.formatMessage(
                                globalMessages.partiallyavailable
                              )}
                            </Badge>
                          )}
                          {mediaStatus === MediaStatus.AVAILABLE && (
                            <Badge badgeType="success">
                              {intl.formatMessage(globalMessages.available)}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default SiteRequestModal;
