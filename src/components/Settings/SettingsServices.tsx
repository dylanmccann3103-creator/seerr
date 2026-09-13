import PageTitle from '@app/components/Common/PageTitle';
import SettingsWhisparr from '@app/components/Settings/SettingsWhisparr';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Settings', {
  services: 'Services',
});

const SettingsServices = () => {
  const intl = useIntl();

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.services),
          intl.formatMessage(globalMessages.settings),
        ]}
      />
      <SettingsWhisparr />
    </>
  );
};

export default SettingsServices;
