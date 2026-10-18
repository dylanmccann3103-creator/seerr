import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { isValidURL } from '@app/utils/urlValidationHelper';
import {
  ArrowDownOnSquareIcon,
  ArrowPathIcon,
  BeakerIcon,
} from '@heroicons/react/24/outline';
import type { WhisparrSettings } from '@server/lib/settings';
import axios from 'axios';
import { Field, Form, Formik } from 'formik';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';
import * as Yup from 'yup';

const messages = defineMessages('components.Settings.SettingsWhisparr', {
  whisparrsettings: 'Whisparr Settings',
  whisparrsettingsDescription:
    'Configure the connection to your Whisparr instance. This is the only service used to fulfill requests.',
  apiVersion: 'API Version',
  apiVersionHelp:
    'v2 tracks sites (series) and seasons (years). v3 is scene-only, keyed by StashDB ID.',
  stashDbApiKey: 'StashDB API Key',
  stashDbApiKeyHelp:
    'Used to resolve a scene to its StashDB ID when it has no direct StashDB link. Find it in your StashDB account settings.',
  searchOnAddV3: 'Search Immediately When Added',
  searchOnAddV3Help:
    'Trigger a download search as soon as a scene is added in Whisparr v3. Off by default so a bulk migration does not try to download everything at once.',
  migrateV3: 'Resend All Whisparr Requests',
  migrateV3Help:
    'Resolves every non-declined, non-completed request to its StashDB ID and (re)adds it in Whisparr v3.',
  migratingV3: 'Resending…',
  toastMigrateV3Success:
    '{added} added, {skipped} already present, {notFound} not found on StashDB, {failed} failed.',
  toastMigrateV3Failure: 'Failed to resend requests to Whisparr v3.',
  enabled: 'Enable Whisparr',
  hostname: 'Hostname or IP Address',
  port: 'Port',
  ssl: 'Use SSL',
  apiKey: 'API Key',
  apiKeyHelp: 'Find it in Whisparr: Settings > General > Security > API Key',
  baseUrl: 'URL Base',
  baseUrlHelp:
    'If you set a URL Base in Whisparr (Settings > General > Host), enter it here (e.g. /whisparr). Leave blank otherwise.',
  externalUrl: 'External URL',
  externalUrlHelp:
    'For clickable links on media pages when the hostname is not reachable from outside your network.',
  qualityprofile: 'Quality Profile',
  rootfolder: 'Root Folder',
  selectQualityProfile: 'Select quality profile',
  selectRootFolder: 'Select root folder',
  loadingprofiles: 'Loading quality profiles…',
  testFirstQualityProfiles: 'Test connection to load quality profiles',
  loadingrootfolders: 'Loading root folders…',
  testFirstRootFolders: 'Test connection to load root folders',
  monitorNewItems: 'Monitor New Items',
  monitorNewItemsHelp:
    'Whether Whisparr should monitor (All) or not (None) new items when a site is added.',
  searchOnRequest: 'Enable Automatic Search',
  searchOnRequestHelp:
    'Automatically trigger a search in Whisparr when a request is approved.',
  tagRequests: 'Tag Requests',
  tagRequestsInfo:
    "Automatically add an additional tag with the requester's user ID & display name",
  validationHostnameRequired: 'You must provide a valid hostname or IP address',
  validationPortRequired: 'You must provide a valid port number',
  validationApiKeyRequired: 'You must provide an API key',
  validationRootFolderRequired: 'You must select a root folder',
  validationProfileRequired: 'You must select a quality profile',
  validationApplicationUrl: 'You must provide a valid URL',
  validationApplicationUrlTrailingSlash: 'URL must not end in a trailing slash',
  validationBaseUrlLeadingSlash: 'Base URL must have a leading slash',
  validationBaseUrlTrailingSlash: 'Base URL must not end in a trailing slash',
  toastWhisparrTestSuccess: 'Whisparr connection established successfully!',
  toastWhisparrTestFailure: 'Failed to connect to Whisparr.',
  toastWhisparrSettingsSuccess: 'Whisparr settings saved successfully!',
  toastWhisparrSettingsFailure:
    'Something went wrong while saving Whisparr settings.',
});

interface WhisparrTestResponse {
  version?: string;
  profiles: { id: number; name: string }[];
  rootFolders: { id: number; path: string }[];
  tags: { id: number; label: string }[];
  urlBase?: string;
}

const SettingsWhisparr = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const autoTested = useRef(false);
  const [isValidated, setIsValidated] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [testResponse, setTestResponse] = useState<WhisparrTestResponse>({
    profiles: [],
    rootFolders: [],
    tags: [],
  });
  const {
    data,
    error,
    mutate: revalidate,
  } = useSWR<WhisparrSettings>('/api/v1/settings/whisparr');

  const WhisparrSettingsSchema = Yup.object().shape({
    hostname: Yup.string().required(
      intl.formatMessage(messages.validationHostnameRequired)
    ),
    port: Yup.number()
      .nullable()
      .required(intl.formatMessage(messages.validationPortRequired)),
    apiKey: Yup.string().required(
      intl.formatMessage(messages.validationApiKeyRequired)
    ),
    rootFolder: Yup.string().required(
      intl.formatMessage(messages.validationRootFolderRequired)
    ),
    activeProfileId: Yup.string().required(
      intl.formatMessage(messages.validationProfileRequired)
    ),
    externalUrl: Yup.string()
      .test(
        'valid-url',
        intl.formatMessage(messages.validationApplicationUrl),
        isValidURL
      )
      .test(
        'no-trailing-slash',
        intl.formatMessage(messages.validationApplicationUrlTrailingSlash),
        (value) => !value || !value.endsWith('/')
      ),
    baseUrl: Yup.string()
      .test(
        'leading-slash',
        intl.formatMessage(messages.validationBaseUrlLeadingSlash),
        (value) => !value || value.startsWith('/')
      )
      .test(
        'no-trailing-slash',
        intl.formatMessage(messages.validationBaseUrlTrailingSlash),
        (value) => !value || !value.endsWith('/')
      ),
  });

  const testConnection = useCallback(
    async ({
      hostname,
      port,
      apiKey,
      baseUrl,
      useSsl = false,
    }: {
      hostname: string;
      port: number;
      apiKey: string;
      baseUrl?: string;
      useSsl?: boolean;
    }) => {
      setIsTesting(true);
      try {
        const response = await axios.post<WhisparrTestResponse>(
          '/api/v1/settings/whisparr/test',
          {
            hostname,
            apiKey,
            port: Number(port),
            baseUrl,
            useSsl,
          }
        );

        setIsValidated(true);
        setTestResponse(response.data);
        if (autoTested.current) {
          addToast(intl.formatMessage(messages.toastWhisparrTestSuccess), {
            appearance: 'success',
            autoDismiss: true,
          });
        }
      } catch {
        setIsValidated(false);
        if (autoTested.current) {
          addToast(intl.formatMessage(messages.toastWhisparrTestFailure), {
            appearance: 'error',
            autoDismiss: true,
          });
        }
      } finally {
        setIsTesting(false);
      }
    },
    [addToast, intl]
  );

  // Auto-validate the saved config once, on first load, so the profile/root
  // folder selects are already populated when the page opens.
  useEffect(() => {
    if (data && !autoTested.current) {
      if (data.hostname && data.apiKey) {
        testConnection({
          hostname: data.hostname,
          port: data.port,
          apiKey: data.apiKey,
          baseUrl: data.baseUrl,
          useSsl: data.useSsl,
        }).finally(() => {
          autoTested.current = true;
        });
      } else {
        autoTested.current = true;
      }
    }
  }, [data, testConnection]);

  const migrateToV3 = useCallback(async () => {
    setIsMigrating(true);
    try {
      const response = await axios.post<{
        added: number;
        skipped: number;
        notFound: number;
        failed: number;
      }>('/api/v1/settings/whisparr/migrate-v3');

      addToast(
        intl.formatMessage(messages.toastMigrateV3Success, response.data),
        { appearance: 'info', autoDismiss: false }
      );
    } catch {
      addToast(intl.formatMessage(messages.toastMigrateV3Failure), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsMigrating(false);
    }
  }, [addToast, intl]);

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  return (
    <>
      <div className="mb-6">
        <h3 className="heading">
          {intl.formatMessage(messages.whisparrsettings)}
        </h3>
        <p className="description">
          {intl.formatMessage(messages.whisparrsettingsDescription)}
        </p>
      </div>
      <Formik
        initialValues={{
          enabled: data?.enabled ?? false,
          hostname: data?.hostname ?? '',
          port: data?.port ?? 6969,
          useSsl: data?.useSsl ?? false,
          apiKey: data?.apiKey ?? '',
          baseUrl: data?.baseUrl ?? '',
          externalUrl: data?.externalUrl ?? '',
          activeProfileId: data?.activeProfileId || undefined,
          rootFolder: data?.activeDirectory ?? '',
          monitorNewItems: data?.monitorNewItems ?? 'none',
          searchOnRequest: data?.searchOnRequest ?? true,
          tagRequests: data?.tagRequests ?? false,
          apiVersion: data?.apiVersion ?? 'v2',
          stashDbApiKey: data?.stashDbApiKey ?? '',
          searchOnAddV3: data?.searchOnAddV3 ?? false,
        }}
        enableReinitialize
        validationSchema={WhisparrSettingsSchema}
        onSubmit={async (values) => {
          try {
            const profileName = testResponse.profiles.find(
              (profile) => profile.id === Number(values.activeProfileId)
            )?.name;

            await axios.put('/api/v1/settings/whisparr', {
              enabled: values.enabled,
              hostname: values.hostname,
              port: Number(values.port),
              useSsl: values.useSsl,
              apiKey: values.apiKey,
              baseUrl: values.baseUrl,
              externalUrl: values.externalUrl,
              activeProfileId: Number(values.activeProfileId),
              activeProfileName: profileName ?? '',
              activeDirectory: values.rootFolder,
              monitorNewItems: values.monitorNewItems,
              searchOnRequest: values.searchOnRequest,
              tagRequests: values.tagRequests,
              apiVersion: values.apiVersion,
              stashDbApiKey: values.stashDbApiKey,
              searchOnAddV3: values.searchOnAddV3,
            } as WhisparrSettings);

            addToast(
              intl.formatMessage(messages.toastWhisparrSettingsSuccess),
              {
                appearance: 'success',
                autoDismiss: true,
              }
            );
          } catch {
            addToast(
              intl.formatMessage(messages.toastWhisparrSettingsFailure),
              {
                appearance: 'error',
                autoDismiss: true,
              }
            );
          } finally {
            revalidate();
          }
        }}
      >
        {({
          errors,
          touched,
          values,
          setFieldValue,
          handleSubmit,
          isSubmitting,
          isValid,
        }) => (
          <Form className="section" onSubmit={handleSubmit}>
            <div className="form-row">
              <label htmlFor="enabled" className="checkbox-label">
                {intl.formatMessage(messages.enabled)}
              </label>
              <div className="form-input-area">
                <Field type="checkbox" id="enabled" name="enabled" />
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="apiVersion" className="text-label">
                {intl.formatMessage(messages.apiVersion)}
                <span className="label-tip">
                  {intl.formatMessage(messages.apiVersionHelp)}
                </span>
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <Field as="select" id="apiVersion" name="apiVersion">
                    <option value="v2">v2</option>
                    <option value="v3">v3</option>
                  </Field>
                </div>
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="hostname" className="text-label">
                {intl.formatMessage(messages.hostname)}
                <span className="label-required">*</span>
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <span className="protocol">
                    {values.useSsl ? 'https://' : 'http://'}
                  </span>
                  <Field
                    id="hostname"
                    name="hostname"
                    type="text"
                    inputMode="url"
                    className="rounded-r-only"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setIsValidated(false);
                      setFieldValue('hostname', e.target.value);
                    }}
                  />
                </div>
                {errors.hostname && touched.hostname && (
                  <div className="error">{errors.hostname}</div>
                )}
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="port" className="text-label">
                {intl.formatMessage(messages.port)}
                <span className="label-required">*</span>
              </label>
              <div className="form-input-area">
                <Field
                  id="port"
                  name="port"
                  type="text"
                  inputMode="numeric"
                  className="short"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setIsValidated(false);
                    setFieldValue('port', e.target.value);
                  }}
                />
                {errors.port && touched.port && (
                  <div className="error">{errors.port}</div>
                )}
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="useSsl" className="checkbox-label">
                {intl.formatMessage(messages.ssl)}
              </label>
              <div className="form-input-area">
                <Field
                  type="checkbox"
                  id="useSsl"
                  name="useSsl"
                  onChange={() => {
                    setIsValidated(false);
                    setFieldValue('useSsl', !values.useSsl);
                  }}
                />
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="apiKey" className="text-label">
                {intl.formatMessage(messages.apiKey)}
                <span className="label-required">*</span>
                <span className="label-tip">
                  {intl.formatMessage(messages.apiKeyHelp)}
                </span>
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <SensitiveInput
                    as="field"
                    id="apiKey"
                    name="apiKey"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setIsValidated(false);
                      setFieldValue('apiKey', e.target.value);
                    }}
                  />
                </div>
                {errors.apiKey && touched.apiKey && (
                  <div className="error">{errors.apiKey}</div>
                )}
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="baseUrl" className="text-label">
                {intl.formatMessage(messages.baseUrl)}
                <span className="label-tip">
                  {intl.formatMessage(messages.baseUrlHelp)}
                </span>
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <Field
                    id="baseUrl"
                    name="baseUrl"
                    type="text"
                    inputMode="url"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setIsValidated(false);
                      setFieldValue('baseUrl', e.target.value);
                    }}
                  />
                </div>
                {errors.baseUrl && touched.baseUrl && (
                  <div className="error">{errors.baseUrl}</div>
                )}
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="activeProfileId" className="text-label">
                {intl.formatMessage(messages.qualityprofile)}
                <span className="label-required">*</span>
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <Field
                    as="select"
                    id="activeProfileId"
                    name="activeProfileId"
                    disabled={!isValidated || isTesting}
                  >
                    <option value="">
                      {isTesting
                        ? intl.formatMessage(messages.loadingprofiles)
                        : !isValidated
                          ? intl.formatMessage(
                              messages.testFirstQualityProfiles
                            )
                          : intl.formatMessage(messages.selectQualityProfile)}
                    </option>
                    {testResponse.profiles.length > 0 &&
                      testResponse.profiles
                        .toSorted((a, b) =>
                          a.name.localeCompare(b.name, intl.locale, {
                            numeric: true,
                            sensitivity: 'base',
                          })
                        )
                        .map((profile) => (
                          <option
                            key={`loaded-profile-${profile.id}`}
                            value={profile.id}
                          >
                            {profile.name}
                          </option>
                        ))}
                  </Field>
                </div>
                {errors.activeProfileId && touched.activeProfileId && (
                  <div className="error">{errors.activeProfileId}</div>
                )}
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="rootFolder" className="text-label">
                {intl.formatMessage(messages.rootfolder)}
                <span className="label-required">*</span>
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <Field
                    as="select"
                    id="rootFolder"
                    name="rootFolder"
                    disabled={!isValidated || isTesting}
                  >
                    <option value="">
                      {isTesting
                        ? intl.formatMessage(messages.loadingrootfolders)
                        : !isValidated
                          ? intl.formatMessage(messages.testFirstRootFolders)
                          : intl.formatMessage(messages.selectRootFolder)}
                    </option>
                    {testResponse.rootFolders.length > 0 &&
                      testResponse.rootFolders.map((folder) => (
                        <option
                          key={`loaded-rootfolder-${folder.id}`}
                          value={folder.path}
                        >
                          {folder.path}
                        </option>
                      ))}
                  </Field>
                </div>
                {errors.rootFolder && touched.rootFolder && (
                  <div className="error">{errors.rootFolder}</div>
                )}
              </div>
            </div>
            {values.apiVersion === 'v2' && (
              <div className="form-row">
                <label htmlFor="monitorNewItems" className="text-label">
                  {intl.formatMessage(messages.monitorNewItems)}
                  <span className="label-tip">
                    {intl.formatMessage(messages.monitorNewItemsHelp)}
                  </span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field
                      as="select"
                      id="monitorNewItems"
                      name="monitorNewItems"
                      disabled={!isValidated || isTesting}
                    >
                      <option value="all">All</option>
                      <option value="none">None</option>
                    </Field>
                  </div>
                </div>
              </div>
            )}
            {values.apiVersion === 'v3' && (
              <>
                <div className="form-row">
                  <label htmlFor="stashDbApiKey" className="text-label">
                    {intl.formatMessage(messages.stashDbApiKey)}
                    <span className="label-tip">
                      {intl.formatMessage(messages.stashDbApiKeyHelp)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <SensitiveInput
                        as="field"
                        id="stashDbApiKey"
                        name="stashDbApiKey"
                      />
                    </div>
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="searchOnAddV3" className="checkbox-label">
                    {intl.formatMessage(messages.searchOnAddV3)}
                    <span className="label-tip">
                      {intl.formatMessage(messages.searchOnAddV3Help)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <Field
                      type="checkbox"
                      id="searchOnAddV3"
                      name="searchOnAddV3"
                    />
                  </div>
                </div>
              </>
            )}
            <div className="form-row">
              <label htmlFor="externalUrl" className="text-label">
                {intl.formatMessage(messages.externalUrl)}
                <span className="label-tip">
                  {intl.formatMessage(messages.externalUrlHelp)}
                </span>
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <Field
                    id="externalUrl"
                    name="externalUrl"
                    type="text"
                    inputMode="url"
                  />
                </div>
                {errors.externalUrl && touched.externalUrl && (
                  <div className="error">{errors.externalUrl}</div>
                )}
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="searchOnRequest" className="checkbox-label">
                {intl.formatMessage(messages.searchOnRequest)}
                <span className="label-tip">
                  {intl.formatMessage(messages.searchOnRequestHelp)}
                </span>
              </label>
              <div className="form-input-area">
                <Field
                  type="checkbox"
                  id="searchOnRequest"
                  name="searchOnRequest"
                />
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="tagRequests" className="checkbox-label">
                {intl.formatMessage(messages.tagRequests)}
                <span className="label-tip">
                  {intl.formatMessage(messages.tagRequestsInfo)}
                </span>
              </label>
              <div className="form-input-area">
                <Field type="checkbox" id="tagRequests" name="tagRequests" />
              </div>
            </div>
            <div className="actions">
              <div className="flex justify-end">
                {values.apiVersion === 'v3' && (
                  <span className="ml-3 inline-flex rounded-md shadow-sm">
                    <Button
                      buttonType="default"
                      type="button"
                      disabled={isMigrating || isSubmitting}
                      onClick={(e) => {
                        e.preventDefault();
                        migrateToV3();
                      }}
                    >
                      <ArrowPathIcon />
                      <span>
                        {isMigrating
                          ? intl.formatMessage(messages.migratingV3)
                          : intl.formatMessage(messages.migrateV3)}
                      </span>
                    </Button>
                  </span>
                )}
                <span className="ml-3 inline-flex rounded-md shadow-sm">
                  <Button
                    buttonType="warning"
                    disabled={
                      !values.apiKey ||
                      !values.hostname ||
                      !values.port ||
                      isTesting ||
                      isSubmitting
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      autoTested.current = true;
                      testConnection({
                        apiKey: values.apiKey,
                        baseUrl: values.baseUrl,
                        hostname: values.hostname,
                        port: values.port,
                        useSsl: values.useSsl,
                      });
                    }}
                  >
                    <BeakerIcon />
                    <span>
                      {isTesting
                        ? intl.formatMessage(globalMessages.testing)
                        : intl.formatMessage(globalMessages.test)}
                    </span>
                  </Button>
                </span>
                <span className="ml-3 inline-flex rounded-md shadow-sm">
                  <Button
                    buttonType="primary"
                    type="submit"
                    disabled={
                      !isValidated || isSubmitting || isTesting || !isValid
                    }
                  >
                    <ArrowDownOnSquareIcon />
                    <span>
                      {isSubmitting
                        ? intl.formatMessage(globalMessages.saving)
                        : intl.formatMessage(globalMessages.save)}
                    </span>
                  </Button>
                </span>
              </div>
            </div>
          </Form>
        )}
      </Formik>
    </>
  );
};

export default SettingsWhisparr;
