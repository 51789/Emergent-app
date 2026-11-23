# Consulens mobile

React Native + Expo client of **Consulens** ("Report • Analisi • Ricerche"): a white, clean, navy-driven
assistant that monitors the web for you in eight categories (real estate, public competitions, cars and
motorcycles, tenders and funds, entertainment, finance, new laws, jobs) and notifies you of new results.

It is a from-scratch rewrite of the original Emergent-generated `frontend/`, built against the REST API
described in [API contract](#api-contract-and-client-behaviour). One codebase runs on iOS, Android and web.

| | |
|---|---|
| Expo SDK | **58** (`expo ~58.0.26`, React Native 0.88.1, React 19.3, React Compiler on) |
| Routing | expo-router 58 (file based, typed routes, `Stack.Protected` auth gate) |
| Server state | @tanstack/react-query 5 (infinite queries, optimistic updates) |
| Local state | zustand 5 (+ AsyncStorage persistence), tokens in expo-secure-store / localStorage on web |
| i18n | i18next 27 + react-i18next 18 + expo-localization (IT, EN, ES, FR, DE, type-checked keys) |
| Typography | Montserrat 400/500/600/700 (`@expo-google-fonts/montserrat`), the geometric sans of the logo |
| Language | TypeScript 6, `strict` |
| Tests | jest-expo (jest 30) |

## Quick start

Requirements: Node 20+ (developed on Node 24 / npm 11) and, for devices, the Expo Go app or a development build.

```bash
cd mobile
npm install
cp .env.example .env        # then edit the values (see below)
npm run web                 # or: npm start, then press a / i / w
```

### Run against the local backend

The backend lives in `../server` and listens on `http://127.0.0.1:8000` (API under `/api/v1`).
Put this in `mobile/.env`:

```env
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000
```

The client appends `/api/v1`, so do **not** include it. Notes per target:

- **Web** (`npm run web`, served on http://localhost:8081): works with `127.0.0.1`. The backend must allow the web origin
  (`http://localhost:8081`) in its CORS settings.
- **iOS simulator**: `127.0.0.1` works as is.
- **Android emulator**: the emulator's own `localhost` is not your PC; use `http://10.0.2.2:8000`.
- **Physical device**: use your computer's LAN IP (`http://192.168.x.y:8000`) and start the backend bound to `0.0.0.0`.
  Android blocks cleartext `http://` in release builds, so use HTTPS for preview/production builds.

After changing `.env`, restart Metro with `npx expo start --clear` (public variables are inlined at bundle time).

### Useful scripts

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | `expo lint` (eslint-config-expo + React Compiler rules) |
| `npm test` | jest unit tests (API client refresh logic, utilities, locales parity, ...) |
| `npm run export:web` | `expo export --platform web` into `dist/` (static SPA, host it anywhere) |
| `npm run doctor` | `expo-doctor` |

## Environment variables

All are `EXPO_PUBLIC_*`, i.e. **embedded in the app bundle: never put secrets here**. See `.env.example`.
For EAS builds define the same names with `eas env:create` (environments `development`, `preview`, `production`).

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | Backend base URL **without** `/api/v1`. |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google OAuth *web* client id. Needed on every platform: it makes Google issue the ID token the backend verifies, and it is the client id of the web button. |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | iOS OAuth client id. Also used to derive the iOS URL scheme in `app.config.ts`. |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Android OAuth client id (kept for documentation/consistency; Android resolves it from package name + SHA-1). |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | EAS project id (`eas init`). Required to obtain Expo push tokens. |
| `EXPO_PUBLIC_VOICE_INPUT` | Feature flag: set to `false` to hide the microphone button. |

## Expo Go vs development build

Almost everything runs in **Expo Go**, but three features rely on native code that Expo Go does not ship.
The app detects this at runtime and degrades instead of crashing:

| Feature | Expo Go | Dev build / store build | Web |
|---|---|---|---|
| Email/password, search, results, favorites, admin, subscription | yes | yes | yes |
| Read aloud (`expo-speech`) | yes | yes | yes (browser voices) |
| **Google Sign-In** (`@react-native-google-signin/google-signin`) | no: the button shows "requires a development build" | yes | yes, through Google Identity Services (official button) |
| **Voice dictation** (`expo-speech-recognition`) | microphone button hidden | yes | yes where the browser has the Web Speech API (Chrome, Safari) |
| **Push notifications** (`expo-notifications`) | not on Android (removed from Expo Go in SDK 53); iOS needs the EAS project id | yes | not supported |

Create a development build once, then iterate with Metro as usual:

```bash
npm i -g eas-cli            # or use: npx eas-cli@latest <command>
eas login
eas init                    # creates the EAS project, prints the project id for EXPO_PUBLIC_EAS_PROJECT_ID
eas build --profile development --platform android      # or ios (iOS needs an Apple developer account)
npx expo start --dev-client
```

Local alternative (needs Android Studio / Xcode): `npx expo run:android` / `npx expo run:ios`.

## EAS build profiles (`eas.json`)

| Profile | Use |
|---|---|
| `development` | Development client, internal distribution (iOS simulator build enabled), `development` environment variables. |
| `preview` | Release-like build for testers, internal distribution, `preview` variables. |
| `production` | Store build, build number auto-incremented remotely, `production` variables. |

```bash
eas build --profile preview --platform all
eas build --profile production --platform all
eas submit --profile production --platform ios      # / android
```

## What the owner must configure

1. **Bundle id / package name.** `com.consulens.app` in `app.config.ts` is a **placeholder**, not a registered
   identifier. Replace `APP_IDENTIFIER` with the one you own **before the first store build** (it cannot change later).
2. **EAS project.** Run `eas init`, then set `EXPO_PUBLIC_EAS_PROJECT_ID` (local `.env` and EAS environments).
3. **Google Sign-In.** In Google Cloud Console create OAuth clients: *Web* (add your web origin(s) under
   "Authorized JavaScript origins"), *iOS* (bundle id) and *Android* (package name + SHA-1 of each signing key: debug,
   EAS upload/production). Set the three `EXPO_PUBLIC_GOOGLE_*` variables. The backend must hold the web client id to verify tokens.
4. **Push notifications.** Android: add a Firebase project, download `google-services.json` and reference it through
   `android.googleServicesFile` in `app.config.ts` (the file is git-ignored; upload it as an EAS file secret).
   Upload an FCM V1 credential and an Apple push key with `eas credentials`. Pushes carry
   `data = { type: "new_results", search_id, category, count }`: a tap opens `/search/<search_id>` (or Notifications).
5. **Backend URL** per environment (`EXPO_PUBLIC_API_URL`) and CORS for the web origin.
6. **Brand assets.** The official logo lives in `assets/images/brand/` (`logo-wordmark.png` is used by the app header,
   `logo-full.png` / `logo-mark.png` are kept for marketing use) with the original in `assets/brand-source/`. The store icon,
   adaptive icon, notification icon, splash and favicon in `assets/images/` were derived from it. Replace them all if the logo changes.
7. **Store listings, privacy policy and permission texts.** Microphone / speech-recognition usage strings are set in
   `app.config.ts` (Italian).

### In-app purchases (important for store release)

Apple and Google require **digital subscriptions sold inside an iOS/Android app to use their own in-app purchase
systems** (App Store IAP / Google Play Billing). The Subscribe screen currently opens the backend's hosted Stripe
checkout (`POST /billing/checkout`) in an in-app browser (web: same-tab redirect) and the customer portal for
"Gestisci abbonamento". That is fine for the web build and for development, but a store build that sells
subscriptions this way is likely to be **rejected**.

The usual path is **RevenueCat** (one SDK over StoreKit + Play Billing, entitlements synced to your backend by
webhook, `react-native-purchases`; needs a development build). This is **deliberately not implemented**: the code is
flagged in `src/features/subscribe/useBillingFlow.ts` and `SubscribeScreen.tsx`. A common compromise is to keep
Stripe for web and use IAP on iOS/Android, and map both to the same `plan` on the server.

## Brand and design

- **Palette** (`src/theme/colors.ts`), taken from the logo: navy `#0C2038` is the primary colour (text, buttons with white
  text, links, active tab, selected chips, focus rings, spinners); slate `#7C8994` ("Lens") and light grey `#D4D9DE` (lens
  highlight) are decorative. Slate is only 3.6:1 on white, so small secondary text uses the darker `#5B6773` (5.8:1).
  Surfaces are `#F3F5F7` with `#E3E7EB` borders. Red (`#D92D20`) is kept for unseen badges and destructive actions.
- **Contrast is enforced**: `src/theme/__tests__/contrast.test.ts` checks every text/background pairing against WCAG AA (4.5:1).
- **Logo**: `BrandLogo` renders the wordmark image (undistorted, sized by height); `BrandTagline` draws the localised tagline
  (Montserrat Regular, wide tracking, slate bullets) as text so it can be translated.
- **Typography**: Montserrat everywhere (`src/theme/typography.ts`); one font file per weight, no `fontWeight` tricks.

## Project layout

```
mobile/
  app/                         expo-router routes: thin files that render a feature screen
    _layout.tsx                providers, fonts, splash, auth gate (Stack.Protected)
    (auth)/  index (login, shared "/" route), register
    (app)/   (tabs)/ index, favorites, notifications, settings
             category/[id], search/[id], manage, subscribe
    admin/   index, users, analytics        (role admin only)
  src/
    api/          client.ts (fetch client, 401 refresh single-flight), types.ts, endpoints/, hooks/ (React Query),
                  queryKeys.ts, cache.ts (optimistic cache helpers), tokenStorage.ts
    features/     auth, home, category, search, manage, results, favorites, notifications, settings,
                  subscribe, admin, speech (TTS + read-aloud), push
    components/   design-system pieces (AppText, Button, TextField, Badge, dialogs, charts, ...)
    i18n/         locales/{it,en,es,fr,de}.ts (it.ts is the typed source of truth), languages, hooks
    theme/        colors, spacing, typography tokens
    store/        zustand preferences (language, voice gender, push token)
    constants/    categories, keyword chips
    utils/        pure helpers (dates, formatting, errors, validation, ...) with unit tests
  assets/         images/brand (official logo), app icons and splash, brand-source (original logo file)
  app.config.ts   dynamic Expo config (reads env, no secrets)
  eas.json        build profiles
```

### Routes

| URL | Screen |
|---|---|
| `/` | Signed out: login. Signed in: Home (category grid with per-category badges, bell) |
| `/register` | Registration |
| `/favorites`, `/notifications`, `/settings` | Tabs |
| `/category/[id]` | Natural-language request, dictation, keyword chips, searches of the category |
| `/search/[id]` | Results, pull-to-refresh, "Aggiorna ora", polling, read aloud, multi-select remove |
| `/manage` | All searches: pause/resume, filter by category, bulk activate/deactivate/delete |
| `/subscribe` | Plans (monthly/yearly), checkout, portal |
| `/admin`, `/admin/users`, `/admin/analytics` | Admin dashboard, users CRUD, analytics (admin only) |

## API contract and client behaviour

Base URL `${EXPO_PUBLIC_API_URL}/api/v1`, JSON, `Authorization: Bearer <access_token>`, errors as
`{"error":{"code","message"}}`. Types are in `src/api/types.ts`.

- **Refresh tokens are single use with reuse detection.** `src/api/client.ts` refreshes on any 401 of an authenticated call
  with one shared in-flight promise, so concurrent 401s never send the same refresh token twice. A request that was sent
  with a token that has meanwhile been rotated is simply replayed with the current one. If the refresh endpoint answers
  with any 4xx (`refresh_token_reused`, `refresh_token_expired`, `invalid_refresh_token`, ...) the tokens are wiped and the
  user is sent to login. Network/5xx failures during refresh keep the session.
- Error codes are mapped to translated messages in all five languages (`src/utils/errors.ts`): `plan_limit_reached` (402,
  upsell dialog to Subscribe), `rate_limited` (429, "riprova tra N min" from `Retry-After`), `already_subscribed` /
  `no_billing_account` (409), `billing_not_configured` (503), `billing_provider_error` (502), `google_auth_not_configured`,
  `invalid_google_token`, `email_not_verified`, admin `cannot_demote_self` / `cannot_delete_self` / `last_admin`, 422 validation.
- Removing a result calls `DELETE /results/{id}` / bulk delete, which hides it permanently: the UI says "Rimuovi".
- Result verification: `verified`, `verified_at` and `source_trust` are optional on `Result` (older backends omit them: treated as
  not verified / `other`). Cards show a navy "Verificato" check badge (accessibility hint with the check date), a slate
  "Non verificato" badge, and a navy-outline "Fonte ufficiale" label for `source_trust: "official"`. Lists keep the server order
  (verified first, then `posted_date` desc): nothing is re-sorted on the client.
- While a search is pending/running `next_run_at` is a lease, not a schedule: it is not shown as "prossimo aggiornamento".
- `GET /billing/plans` is requested with `?language=<UI language>`.
- `conversion_rate` is a 0-1 fraction shown as a percentage; `total_users` / `total_searches` are all-time and labelled "totali".

## Notes

- Dates `posted_date` / `expiry_date` are `YYYY-MM-DD` calendar dates, formatted without timezone shifts.
- Alerts use an in-app dialog host (`src/components/dialog`) because `Alert.alert` does nothing on react-native-web.
- The custom analytics range sends ISO UTC datetimes (`<from>T00:00:00Z` / `<to>T23:59:59Z`).
