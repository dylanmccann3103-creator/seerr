import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { isValidURL } from '@app/utils/urlValidationHelper';
import {
  ArrowDownOnSquareIcon,
  BeakerIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import type { StashSettings } from '@server/lib/settings';
import axios from 'axios';
import { Field, Form, Formik } from 'formik';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';
import * as Yup from 'yup';

const messages = defineMessages('components.Settings.SettingsStash', {
  stashsettings: 'Stash Settings',
  stashsettingsDescription:
    'Configure the connection to your Stash instance. Stash is used to match requested scenes against your existing library.',
  enabled: 'Enable Stash',
  url: 'URL',
  urlHelp: 'The full base URL of your Stash instance, including port.',
  apiKey: 'API Key',
  pathMappings: 'Path Mappings',
  pathMappingsHelp:
    'Map a Whisparr container path to the equivalent Stash container path, so scenes can be matched across the two services.',
  pathMappingsAdd: 'Add Mapping',
  pathMappingsRemove: 'Remove',
  pathMappingsFrom: 'From (Whisparr Path)',
  pathMappingsTo: 'To (Stash Path)',
  pathMappingsIncomplete: 'All path mappings must have both a from and a to',
  validationUrl: 'You must provide a valid URL',
  toastStashTestSuccess:
    'Stash connection established successfully! Found {sceneCount} {sceneCount, plural, one {scene} other {scenes}}.',
  toastStashTestFailure: 'Failed to connect to Stash.',
  toastStashSettingsSuccess: 'Stash settings saved successfully!',
  toastStashSettingsFailure:
    'Something went wrong while saving Stash settings.',
});

const SettingsStash = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [isTesting, setIsTesting] = useState(false);
  const {
    data,
    error,
    mutate: revalidate,
  } = useSWR<StashSettings>('/api/v1/settings/stash');

  const StashSettingsSchema = Yup.object().shape({
    url: Yup.string().when('enabled', {
      is: true,
      then: (schema) =>
        schema
          .required(intl.formatMessage(messages.validationUrl))
          .test(
            'valid-url',
            intl.formatMessage(messages.validationUrl),
            isValidURL
          ),
      otherwise: (schema) =>
        schema.test(
          'valid-url',
          intl.formatMessage(messages.validationUrl),
          (value) => !value || isValidURL(value)
        ),
    }),
    pathMappings: Yup.array()
      .of(
        Yup.object().shape({
          from: Yup.string(),
          to: Yup.string(),
        })
      )
      .test(
        'complete-mappings',
        intl.formatMessage(messages.pathMappingsIncomplete),
        (mappings) => {
          if (!mappings || mappings.length === 0) return true;
          return mappings.every(
            (mapping) =>
              (!mapping.from || !mapping.from.trim()) ===
              (!mapping.to || !mapping.to.trim())
          );
        }
      ),
  });

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  return (
    <>
      <div className="mb-6">
        <h3 className="heading">
          {intl.formatMessage(messages.stashsettings)}
        </h3>
        <p className="description">
          {intl.formatMessage(messages.stashsettingsDescription)}
        </p>
      </div>
      <Formik
        initialValues={{
          enabled: data?.enabled ?? false,
          url: data?.url ?? '',
          apiKey: data?.apiKey ?? '',
          pathMappings: data?.pathMappings ?? [],
        }}
        enableReinitialize
        validationSchema={StashSettingsSchema}
        onSubmit={async (values) => {
          try {
            await axios.put('/api/v1/settings/stash', {
              enabled: values.enabled,
              url: values.url,
              apiKey: values.apiKey,
              pathMappings: values.pathMappings
                .map((mapping) => ({
                  from: mapping.from?.trim() ?? '',
                  to: mapping.to?.trim() ?? '',
                }))
                .filter((mapping) => mapping.from && mapping.to),
            } as StashSettings);

            addToast(intl.formatMessage(messages.toastStashSettingsSuccess), {
              appearance: 'success',
              autoDismiss: true,
            });
          } catch {
            addToast(intl.formatMessage(messages.toastStashSettingsFailure), {
              appearance: 'error',
              autoDismiss: true,
            });
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
        }) => {
          const testConnection = async () => {
            setIsTesting(true);
            try {
              const response = await axios.post<{
                status: string;
                sceneCount: number;
              }>('/api/v1/settings/stash/test', {
                url: values.url,
                apiKey: values.apiKey,
              });

              addToast(
                intl.formatMessage(messages.toastStashTestSuccess, {
                  sceneCount: response.data.sceneCount,
                }),
                {
                  appearance: 'success',
                  autoDismiss: true,
                }
              );
            } catch {
              addToast(intl.formatMessage(messages.toastStashTestFailure), {
                appearance: 'error',
                autoDismiss: true,
              });
            } finally {
              setIsTesting(false);
            }
          };

          return (
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
                <label htmlFor="url" className="text-label">
                  {intl.formatMessage(messages.url)}
                  <span className="label-tip">
                    {intl.formatMessage(messages.urlHelp)}
                  </span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field id="url" name="url" type="text" inputMode="url" />
                  </div>
                  {errors.url && touched.url && (
                    <div className="error">{errors.url}</div>
                  )}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="apiKey" className="text-label">
                  {intl.formatMessage(messages.apiKey)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <SensitiveInput as="field" id="apiKey" name="apiKey" />
                  </div>
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="pathMappings" className="text-label">
                  {intl.formatMessage(messages.pathMappings)}
                  <span className="label-tip">
                    {intl.formatMessage(messages.pathMappingsHelp)}
                  </span>
                </label>
                <div className="form-input-area">
                  <div className="space-y-2">
                    {values.pathMappings.map((mapping, index) => (
                      <div key={index} className="flex gap-2">
                        <div className="flex-1">
                          <div className="form-input-field">
                            <Field
                              name={`pathMappings.${index}.from`}
                              type="text"
                              placeholder={intl.formatMessage(
                                messages.pathMappingsFrom
                              )}
                            />
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="form-input-field">
                            <Field
                              name={`pathMappings.${index}.to`}
                              type="text"
                              placeholder={intl.formatMessage(
                                messages.pathMappingsTo
                              )}
                            />
                          </div>
                        </div>
                        <div className="flex items-center">
                          <Button
                            buttonType="danger"
                            buttonSize="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              setFieldValue(
                                'pathMappings',
                                values.pathMappings.filter(
                                  (_, i) => i !== index
                                )
                              );
                            }}
                            title={intl.formatMessage(
                              messages.pathMappingsRemove
                            )}
                          >
                            <TrashIcon />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      buttonType="default"
                      buttonSize="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        setFieldValue('pathMappings', [
                          ...values.pathMappings,
                          { from: '', to: '' },
                        ]);
                      }}
                    >
                      <PlusIcon />
                      <span>
                        {intl.formatMessage(messages.pathMappingsAdd)}
                      </span>
                    </Button>
                  </div>
                  {errors.pathMappings &&
                    touched.pathMappings &&
                    typeof errors.pathMappings === 'string' && (
                      <div className="error">{errors.pathMappings}</div>
                    )}
                </div>
              </div>
              <div className="actions">
                <div className="flex justify-end">
                  <span className="ml-3 inline-flex rounded-md shadow-sm">
                    <Button
                      buttonType="warning"
                      disabled={!values.url || isTesting || isSubmitting}
                      onClick={(e) => {
                        e.preventDefault();
                        testConnection();
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
                      disabled={isSubmitting || isTesting || !isValid}
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
          );
        }}
      </Formik>
    </>
  );
};

export default SettingsStash;
