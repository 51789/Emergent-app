import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';

import { env } from '@/config/env';

import { GoogleButtonView } from './GoogleButtonView';
import type { GoogleButtonProps } from './types';

/**
 * Web sign-in with Google Identity Services (GIS): Google renders its own button and returns an
 * ID token (`credential`) which we send to POST /auth/google. No redirect flow, no secrets.
 * Requires the web client id and the site origin listed under "Authorized JavaScript origins".
 */

interface GisCredentialResponse {
  credential?: string;
}

interface GisId {
  initialize: (config: {
    client_id: string;
    callback: (response: GisCredentialResponse) => void;
    ux_mode?: 'popup' | 'redirect';
    auto_select?: boolean;
  }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
}

interface GisWindow {
  google?: { accounts?: { id?: GisId } };
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

let scriptPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if ((globalThis as GisWindow).google?.accounts?.id) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('Failed to load Google Identity Services'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export function GoogleButton({ onIdToken, onError, disabled }: GoogleButtonProps) {
  const { t, i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  // Keep the latest callbacks without re-initialising GIS (which warns if initialised repeatedly).
  const handlers = useRef({ onIdToken, onError });
  useEffect(() => {
    handlers.current = { onIdToken, onError };
  }, [onIdToken, onError]);

  const clientId = env.googleWebClientId;

  useEffect(() => {
    if (!clientId || width === 0) return;
    let cancelled = false;

    loadGisScript()
      .then(() => {
        const gis = (globalThis as GisWindow).google?.accounts?.id;
        const container = containerRef.current;
        if (cancelled || !gis || !container) return;
        gis.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          auto_select: false,
          callback: (response) => {
            if (response.credential) void handlers.current.onIdToken(response.credential);
            else handlers.current.onError(t('auth.googleFailed'));
          },
        });
        container.innerHTML = '';
        gis.renderButton(container, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width))),
          locale: i18n.language,
        });
      })
      .catch(() => handlers.current.onError(t('auth.googleFailed')));

    return () => {
      cancelled = true;
    };
  }, [clientId, width, i18n.language, t]);

  if (!clientId) {
    return (
      <GoogleButtonView
        label={t('auth.continueWithGoogle')}
        onPress={() => onError(t('auth.googleNotConfigured'))}
        disabled={disabled}
      />
    );
  }

  return (
    <View
      style={[styles.container, disabled && styles.disabled]}
      pointerEvents={disabled ? 'none' : 'auto'}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
    >
      <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignSelf: 'stretch', alignItems: 'center', minHeight: 44 },
  disabled: { opacity: 0.5 },
});
