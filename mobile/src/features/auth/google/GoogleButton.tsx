import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  GoogleNotConfiguredError,
  GoogleUnavailableError,
  isGoogleConfigured,
  signInWithGoogle,
} from './googleSignIn';
import { GoogleButtonView } from './GoogleButtonView';
import type { GoogleButtonProps } from './types';

/** Native "Continua con Google" button (iOS / Android). The web version is `GoogleButton.web.tsx`. */
export function GoogleButton({ onIdToken, onError, disabled }: GoogleButtonProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    if (!isGoogleConfigured()) {
      onError(t('auth.googleNotConfigured'));
      return;
    }
    setLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result.status === 'success') await onIdToken(result.idToken);
    } catch (error) {
      if (error instanceof GoogleUnavailableError) onError(t('auth.googleNeedsDevBuild'));
      else if (error instanceof GoogleNotConfiguredError) onError(t('auth.googleNotConfigured'));
      else onError(t('auth.googleFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <GoogleButtonView
      label={t('auth.continueWithGoogle')}
      onPress={handlePress}
      loading={loading}
      disabled={disabled}
    />
  );
}
