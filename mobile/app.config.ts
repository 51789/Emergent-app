import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dynamic Expo config. Everything environment-specific comes from the
 * EXPO_PUBLIC_* variables (see `.env.example`); nothing secret lives here.
 *
 * PLACEHOLDER: `com.consulens.app` is NOT a registered identifier. Replace it
 * with the bundle id / package name owned by the publisher before the first
 * store build (it cannot be changed afterwards without publishing a new app).
 */
const APP_IDENTIFIER = 'com.consulens.app';

/** Logo navy: Android notification accent. */
const BRAND_COLOR = '#0C2038';

/**
 * `@react-native-google-signin/google-signin` needs the iOS URL scheme, which is the
 * reversed iOS OAuth client id: `123-abc.apps.googleusercontent.com`
 * becomes `com.googleusercontent.apps.123-abc`.
 */
function googleIosUrlScheme(iosClientId: string | undefined): string {
  const id = iosClientId?.replace(/\.apps\.googleusercontent\.com$/, '');
  return `com.googleusercontent.apps.${id || 'REPLACE_WITH_IOS_CLIENT_ID'}`;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

  return {
    ...config,
    name: 'Consulens',
    slug: 'consulens',
    version: '1.0.0',
    scheme: 'consulens',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    icon: './assets/images/icon.png',
    backgroundColor: '#FFFFFF',
    ios: {
      supportsTablet: true,
      bundleIdentifier: APP_IDENTIFIER,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: APP_IDENTIFIER,
      adaptiveIcon: {
        backgroundColor: '#FFFFFF',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      bundler: 'metro',
      // Single-page app: works on any static host and avoids server rendering.
      output: 'single',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#FFFFFF',
          image: './assets/images/splash-icon.png',
          imageWidth: 280,
        },
      ],
      [
        'expo-localization',
        { supportedLocales: ['it', 'en', 'es', 'fr', 'de'] },
      ],
      'expo-secure-store',
      [
        'expo-notifications',
        {
          color: BRAND_COLOR,
          icon: './assets/images/notification-icon.png',
        },
      ],
      [
        'expo-speech-recognition',
        {
          microphonePermission: 'Consulens usa il microfono per dettare le tue ricerche.',
          speechRecognitionPermission:
            'Consulens usa il riconoscimento vocale per trascrivere le tue ricerche.',
        },
      ],
      [
        '@react-native-google-signin/google-signin',
        { iosUrlScheme: googleIosUrlScheme(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID) },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      ...config.extra,
      eas: easProjectId ? { projectId: easProjectId } : undefined,
    },
  };
};
