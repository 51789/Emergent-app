/**
 * Public runtime configuration, read from EXPO_PUBLIC_* variables (see `.env.example`).
 * Expo inlines these at bundle time, so each one must be referenced statically.
 */
const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export const env = {
  apiUrl,
  apiBaseUrl: `${apiUrl}/api/v1`,
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
  googleAndroidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
  easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || undefined,
  voiceInputEnabled: process.env.EXPO_PUBLIC_VOICE_INPUT !== 'false',
} as const;

if (!env.apiUrl) {
  console.warn('EXPO_PUBLIC_API_URL is not set: API calls will fail. Copy .env.example to .env.');
}
