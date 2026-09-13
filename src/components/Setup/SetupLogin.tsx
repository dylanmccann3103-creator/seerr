import JellyfinSetup from '@app/components/Setup/JellyfinSetup';
import { useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import type { MediaServerType } from '@server/constants/server';
import { useEffect } from 'react';
import { FormattedMessage } from 'react-intl';

const messages = defineMessages('components.Setup', {
  signin: 'Sign in to your account',
  signinWithJellyfin: 'Enter your Jellyfin details',
});

interface LoginWithMediaServerProps {
  serverType: MediaServerType;
  onCancel: () => void;
  onComplete: () => void;
}

const SetupLogin: React.FC<LoginWithMediaServerProps> = ({
  serverType,
  onCancel,
  onComplete,
}) => {
  const { user, revalidate } = useUser();

  useEffect(() => {
    if (user) {
      onComplete();
    }
  }, [user, onComplete]);

  return (
    <div className="p-4">
      <div className="mb-2 flex justify-center text-xl font-bold">
        <FormattedMessage {...messages.signin} />
      </div>
      <div className="mb-2 flex justify-center pb-6 text-sm">
        <FormattedMessage {...messages.signinWithJellyfin} />
      </div>
      <JellyfinSetup
        revalidate={revalidate}
        serverType={serverType}
        onCancel={onCancel}
      />
    </div>
  );
};

export default SetupLogin;
