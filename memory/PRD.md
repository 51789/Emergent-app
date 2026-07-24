# JARVIS – Il tuo assistente digitale

## Product Vision
Mobile-first AI assistant that monitors the web in background across specialized "agents" (real estate, jobs, cars, funds/bids, news, finance, entertainment, laws) and delivers filtered, dated, actionable results to the user in a clean, white-themed UI.

## Explicit User Requirements (chronological)
1. Multi-agent AI search + clean white grid UI with categories (Immobili, Auto e Moto, Divertimento, Bandi di concorso, Gare d'appalto / Fondi statali e regionali, Finanza, Nuove leggi, Lavoro).
2. Voice input UI on each category page.
3. Notification bell that turns red for unread announcements; per-category counters on the home.
4. Multi-select delete for active searches, favorites (star) toggle, dedicated Favorites page.
5. Premium subscription: separate page with two clean plans (PRO €2,99/mese + PREMIUM €4,99/mese), simple colors matching the white theme.
6. Result cards must show seller_type (Privato/Agenzia/Rivenditore/Ente Pubblico) in black, "ATTIVO" status badge, posted_date, and expiry_date (for Bandi/Gare).
7. Bell opens a dedicated screen listing ONLY unread announcements + trigger native push notifications on iOS/Android.
8. User management + Admin dashboard:
   - JWT custom auth (email/password), roles: `admin`, `user`.
   - Two seed admins: `marcolombardo595@gmail.com`, `davidepioggia.mx96@gmail.com` — password `Jarvis.2026`.
   - Admin panel accessible on BOTH mobile app and web.
   - Stripe subscriptions (monthly + annual, auto-renewal, cancel anytime).
   - Dashboard analytics with time filters: real-time, weekly, monthly, quarterly, semi-annual, annual + custom date range.
   - CRUD utenti/admin (crea/modifica/elimina email, password, ruolo).
   - Password recovery via email: **SKIPPED for now** (per user request 2026-07-23).

## Architecture
- **Frontend:** Expo (SDK 54) + Expo Router + Zustand + React Native Reanimated + expo-notifications + expo-secure-store
- **Backend:** FastAPI + Motor (MongoDB) + Emergent LLM (GPT-5.4) + Serper (web search) + JWT auth + Emergent Push Notifications (SuprSend relay) + httpx
- **DB collections:** `users`, `searches`, `results`, `push_tokens`

## Completed Milestones
### Push Notifications & Dedicated Notifications Screen (2026-07-23) ✅
- Backend `send_push` helper + `/api/register-push` + tap deep links to `/notifications`
- Frontend `/notifications` screen (unread-only, mark-all-read)
- `EMERGENT_PUSH_KEY=placeholder` in `.env` (auto-replaced at deploy)
- `google-services.json` pending user upload

### Auth (JWT) + Admin Dashboard skeleton (2026-07-23) ✅
- Backend: `/api/auth/{register,login,me}` + `/api/admin/users` (CRUD) + seeding of two admins
- Frontend: `/login`, `/admin` (KPI dashboard), `/admin/users` (list + create/edit/delete modal), Settings integration

### Analytics Dashboard (2026-07-23) ✅
- Backend: `/api/admin/analytics/{overview,timeseries,categories}` with 7 range presets + custom date range, auto bucket selection (hour/day/week/month)
- Frontend: `/admin/analytics` with pill filters, native HTML date picker (web) / text input (native), animated line + bar SVG charts (react-native-svg, no external chart lib), auto-refresh in real-time mode
- KPIs: Ricavo stimato mensile (€), Abbonati attivi, Nuovi iscritti, Tasso conversione + Ripartizione piani (Free/Pro/Premium)
- 49/49 backend tests pass

### Refactoring (light-touch, 2026-07-23) ✅
- Extracted `/api/admin/analytics/*` into `backend/routers/analytics.py` via factory pattern (`build_analytics_router(db, require_admin)`) — no circular imports
- Reduced `server.py` from 1506 → 1222 lines while keeping all tests green

### Voice Assistant / TTS Announcement Reading (2026-07-24) ✅
- **Library:** `expo-speech` (Option A: fast, offline, easily upgradable to OpenAI TTS + Whisper STT later)
- **Default voice:** Female (per 2025 UX research showing users generally rate female voices as warmer/more competent)
- **Voice preference toggle** (Female/Male) in Settings, persisted via AsyncStorage
- **Per-card ▶️ Play/⏹ Stop button** in `ResultCard.tsx` reads title + summary + contacts of a single announcement
- **"Leggi tutti" button** in `results.tsx` reads announcements sequentially with intro ("Ecco l'annuncio 1 di N")
- **Conversational loop:** After each announcement (except the last), the assistant speaks *"Vuoi che continui con il prossimo?"* and presents an on-screen modal with **Sì, continua** / **No, ferma** buttons
- **Full multilingual support:** IT / EN / ES / FR / DE — auto-picks best system voice matching locale + gender preference
- **STT (voice reply)** deferred to a future upgrade (Option B: OpenAI Whisper via Emergent LLM Key)

## Pending
- STT integration (voice reply "Sì / No" via OpenAI Whisper) — Voice Loop Phase B
- Stripe integration (monthly/annual subscriptions) — Phase 2C
- Ruoli plans lifecycle (mark expired, upgrade/downgrade)
- Password recovery via email (deferred)
- Serper API key (user optional)
- `google-services.json` (user provides before deploy)

## Test Credentials
See `/app/memory/test_credentials.md`.
