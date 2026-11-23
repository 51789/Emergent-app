# Consulens server

Backend for the Consulens mobile app (formerly CONNECTa, originally JARVIS): a FastAPI API
plus a background
monitoring worker. It watches the web for each user's saved searches (real estate, public
competitions, vehicles, tenders/funds, events, finance, new laws, jobs) and notifies them
about new matches.

This is a clean rewrite with no dependency on the Emergent platform:

| Concern | Implementation |
|---|---|
| API | FastAPI, Pydantic v2, pydantic-settings, base path `/api/v1` |
| Database | PostgreSQL 16, SQLAlchemy 2.0 (async, typed models) + asyncpg, Alembic migrations |
| Web search | [Serper.dev](https://serper.dev) behind a `SearchProvider` interface |
| LLM | Anthropic Claude (`anthropic` SDK, default `claude-haiku-5-5`) or OpenAI (`openai` SDK, Responses API, default `gpt-6.2-sol`), strict structured outputs |
| Monitoring | APScheduler worker, `SELECT ... FOR UPDATE SKIP LOCKED` job claiming |
| Push | Expo Push Service |
| Auth | Email/password (bcrypt), JWT access tokens, rotating refresh tokens, Google ID tokens |
| Billing | Stripe Checkout (`mode=subscription`), Customer Portal, signed webhooks |

## Layout

```
server/
  app/
    main.py              FastAPI app factory (uvicorn app.main:app)
    worker.py            monitoring worker (python -m app.worker)
    container.py         wires settings, DB and external clients (fakes injected in tests)
    bootstrap.py         first admin from BOOTSTRAP_ADMIN_* (only if no admin exists)
    categories.py        the 8 categories, site hints, seller-type taxonomy
    core/                config, errors, security, deps, pagination, plans
    db/                  declarative base, models, engine/session
    modules/             auth, users (/me), searches, results, notifications, billing, admin
    services/            llm, search_provider, normalize, pipeline, notifier, push, scheduler
  alembic/               migrations (versions/0001_initial_schema.py)
  scripts/migrate_from_mongo.py   optional one-off import from the legacy Mongo DB
  tests/                 pytest suite (real PostgreSQL via testcontainers)
```

## How monitoring works

1. **Plan**: the LLM turns the request into structured filters and up to three complementary
   queries. It can target individual listings on PCase, competition notices on inPA and acts
   in the Gazzetta Ufficiale. Empty searches get a fresh plan on the next run. Dated
   queries, competitions and law searches refresh their plans on the next day they run.
2. **Search**: each query goes to Serper. URLs, titles and images come only from the
   provider. Explicit date bounds override category recency defaults. Property listings,
   competitions and laws have no automatic one-month cutoff.
3. **Extract**: the LLM reads only each hit's title, snippet and date, and returns price,
   location, contacts, dates, seller type, an active/expired status and a relevance decision.
   *Fields* must be literally present in the text: every value is re-checked
   (`services/grounding.py`) and dropped if it doesn't appear there. *Relevance* may use
   general knowledge (geography, synonyms such as "bilocale" = "2 locali"). A hit is
   rejected only on a clear contradiction: wrong city or area, a stated price above the
   maximum, wrong contract or explicit property type, expired, a generic or list page, or
   spam. When uncertain it is kept. Rejected hits are stored hidden, so they are never
   re-evaluated.
4. **Verify the page** (`services/fetcher.py`, `services/verifier.py`):
   - Each remaining new URL is fetched as `ConsulensBot/1.0`. The fetcher honours robots.txt
     (cached per host), allows 10 s and 2 MB per page and at most 2 concurrent requests per
     domain, never runs JavaScript, and refuses private or internal addresses.
   - Readable main text is extracted with trafilatura (max ~24k characters), and the
     verify model (`LLM_VERIFY_MODEL`, default `gpt-6-luna` / `claude-haiku-5-5`) checks it.
     The page text is passed as untrusted data inside `<page>` tags; the system prompt is
     authoritative.
   - Outcomes:
     - Available and matching: `verified=true`, with fields from the page (same
       literal-presence guards, now against the page text).
     - 404/410, "annuncio rimosso / non più disponibile", expired or clearly not matching:
       hidden.
     - Blocked, login wall (Facebook and similar), robots-disallowed, timeout or unreadable:
       real estate listings stay hidden until the page can be verified. If a later search
       finds the same URL, the app retries it. Other categories keep the snippet result
       with `verified=false`.
5. **Classify the source**: `source_trust` is `official` (public bodies: `*.gov.it`,
   `regione.<name>.it`, `comune.<name>.it`, Gazzetta Ufficiale, Normattiva, ANAC, Invitalia,
   ...), `trusted` (the category's established portals, e.g. immobiliare.it, indeed.it) or
   `other`. Lists live in `app/categories.py`; `*` matches exactly one domain label, so
   look-alike domains don't qualify.
6. **Dedupe and store**: each search stores one row per normalised URL. A pending real
   estate listing is updated in place when rediscovered. Only results that become visible
   in this run count towards notifications. The same visibility rule applies to earlier
   searches, feeds, favorites and counts.
7. **Notify**: scheduled runs send an Expo push to the user's devices when there are new
   results. Initial and manual runs don't push, because the user is in the app.
   `DeviceNotRegistered` tokens are deleted.

Without `SERPER_API_KEY` a run ends with `last_run_status = "no_provider"` and stores
nothing. Without an LLM provider the app stores raw provider results with the snippet as
the summary. Real estate listings stay pending whenever page verification is disabled or
unavailable.

Both LLM providers share the same prompts, strict output models and post-processing
(`services/llm.py`). Only the API call differs, and the grounding checks in
`services/normalize.py` run on every provider's output.

Refresh intervals by plan: free 24 h, pro 6 h, premium 1 h. Due searches are claimed in one
statement (`UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING id`). The
claim pushes `next_run_at` forward by a lease (`SEARCH_LEASE_SECONDS`), so any number of
workers can run safely, and a search whose worker crashed is retried after the lease.

## Local setup

Requirements: Python 3.11, Docker (for PostgreSQL and the tests).

```bash
cd server
python -m venv .venv
. .venv/Scripts/activate          # Windows (Git Bash); use .venv/bin/activate on Linux/macOS
pip install -r requirements-dev.txt
cp .env.example .env              # set JWT_SECRET at least; add API keys as available
docker compose up -d postgres     # or point DATABASE_URL at any PostgreSQL 16
alembic upgrade head
uvicorn app.main:app --reload     # API on http://localhost:8000/api/v1 (docs: /api/v1/docs)
python -m app.worker              # monitoring worker (or set RUN_SCHEDULER_IN_PROCESS=true)
python -m app.worker --once       # run one scheduler tick and exit
```

Migrations are never applied automatically at app startup. Run `alembic upgrade head` as a
deploy step (`docker compose` does this with the one-off `migrate` service). To create a
migration after changing `app/db/models.py`:

```bash
DATABASE_URL=postgresql+asyncpg://... alembic revision --autogenerate -m "describe change"
```

## Full stack with Docker

```bash
cp .env.example .env    # fill in secrets
docker compose up --build
```

This starts `postgres` (postgres:16, named volume `pgdata`), `migrate` (`alembic upgrade
head`, then exits), `api` (port 8000) and `worker`. The same image runs all three
commands.

## Tests and lint

```bash
pytest -q          # starts postgres:16 with testcontainers, runs Alembic once, TRUNCATEs between tests
ruff check .
ruff format --check .
```

External services are faked (`tests/fakes.py`). Serper and Expo HTTP calls are mocked with
respx, and Stripe webhook signatures are verified by the real Stripe SDK. One test
(`test_migrations_match_models`) fails if the models drift from the committed migrations.

If testcontainers cannot start containers on your machine, use a fixed-port database:

```bash
docker compose -f docker-compose.test.yml up -d
TEST_DATABASE_URL=postgresql+asyncpg://test:test@127.0.0.1:55432/consulens_test pytest -q
docker compose -f docker-compose.test.yml down
```

## Environment variables

Settings are read, highest priority first, from: real environment variables, `server/.env`,
then `<repo root>/.env`. Both files are optional, and their paths are resolved from the code
location, not the working directory. A key in `server/.env` overrides the same key in the
root `.env`. In Docker neither file is copied into the image, so pass environment variables
instead (`docker compose` reads `server/.env` through `env_file`).

| Variable | Required | Notes |
|---|---|---|
| `JWT_SECRET` | **yes** | At least 32 characters. The app refuses to start without it. |
| `DATABASE_URL` | yes (prod) | `postgresql+asyncpg://user:pass@host:5432/db` |
| `LLM_PROVIDER` | no | `auto` (default): Anthropic if `ANTHROPIC_API_KEY` is set, else OpenAI if `OPENAI_API_KEY` is set. Or `anthropic` / `openai`. |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | one recommended | Query planning and grounded extraction |
| `LLM_MODEL` | no | Unset: `claude-haiku-5-5` (anthropic) or `gpt-6.2-sol` (openai) |
| `LLM_VERIFY_MODEL` / `LLM_VERIFY_EFFORT` | no | Page-verification model and effort. Defaults: `gpt-6-luna` (openai) or `claude-haiku-5-5` (anthropic), effort `low`. |
| `VERIFY_PAGES` | no | `true` (default) fetches and re-checks each new candidate page. |
| `VERIFY_USER_AGENT`, `VERIFY_TIMEOUT_SECONDS`, `VERIFY_MAX_BYTES`, `VERIFY_MAX_TEXT_CHARS`, `VERIFY_CONCURRENCY`, `VERIFY_PER_DOMAIN_CONCURRENCY` | no | Defaults: `ConsulensBot/1.0`, 10, 2000000, 24000, 6, 2 |
| `LLM_EFFORT` | no | Default `low`. Anthropic: `low`-`max`. OpenAI `reasoning.effort`: `none` works only on `gpt-6-luna` / `gpt-6.1-terra`. `gpt-6.2-sol` / `gpt-6.2-astra` reject it, so the app refuses to start with that combination. |
| `SERPER_API_KEY` | recommended | Without it, searches end with `no_provider` |
| `SEARCH_COUNTRY`, `SEARCH_RESULTS_PER_QUERY` | no | Defaults: `it`, `10` |
| `GOOGLE_CLIENT_IDS` | for Google sign-in | Comma-separated web/iOS/Android OAuth client IDs |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | for billing | Both are needed for `stripe_configured=true` |
| `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`, `STRIPE_PRICE_PREMIUM_MONTHLY`, `STRIPE_PRICE_PREMIUM_YEARLY` | for billing | Recurring Price IDs (`price_...`) |
| `EXPO_ACCESS_TOKEN` | no | Only if Expo "enhanced push security" is enabled |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | first deploy | Creates or promotes the first admin only when no admin exists. Password: 12-72 bytes. |
| `CORS_ORIGINS` | for web clients | Comma-separated; `*` allows any origin (bearer tokens, no cookies) |
| `RUN_SCHEDULER_IN_PROCESS` | no | `true` runs the scheduler inside the API (dev only) |
| `SCHEDULER_TICK_SECONDS`, `SCHEDULER_BATCH_SIZE`, `SCHEDULER_CONCURRENCY`, `SEARCH_LEASE_SECONDS`, `MANUAL_RUN_COOLDOWN_SECONDS` | no | Defaults: 60, 20, 4, 600, 300 |
| `ACCESS_TOKEN_TTL_MINUTES`, `REFRESH_TOKEN_TTL_DAYS` | no | Defaults: 30, 30 |

## Third-party setup

**Stripe**
1. Create two Products ("Consulens Pro", "Consulens Premium"), each with a monthly and a
   yearly recurring EUR Price:
   2.99/29.99 and 4.99/49.99. Put the four `price_...` IDs in the env.
2. Add a webhook endpoint `https://<host>/api/v1/billing/webhook` with these events:
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`,
   `invoice.payment_failed`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
3. Configure the Customer Portal in the Stripe dashboard (cancel, switch plan, update card).

Each webhook re-fetches the subscription from Stripe, so delivery order does not matter.
Event IDs are stored in `stripe_events` for idempotency. The admin "subscriptions" time
series counts `customer.subscription.created` events.

**Google sign-in**: create OAuth client IDs (web, iOS, Android) in Google Cloud and list them
all in `GOOGLE_CLIENT_IDS`. The app sends the Google `id_token` to `POST /auth/google`, and
the server checks the signature, expiry, issuer, audience and that the email is verified.

**Expo push**: the app registers its `ExponentPushToken[...]` with `POST /push-tokens`.

## Deploy notes

- Run `alembic upgrade head` before starting new API/worker versions.
- Run at least one `python -m app.worker` process alongside the API. Several are fine.
- Serve over HTTPS behind a reverse proxy (uvicorn runs with `--proxy-headers`).
- Logs go to stdout. Request bodies and secrets are never logged.
- `GET /api/v1/health` is suitable for liveness checks.
- Account deletion (`DELETE /api/v1/me`, required by the App Store) cancels any active Stripe
  subscription, then deletes the user and all their data through `ON DELETE CASCADE`.

## Migrating data from the legacy app

Only needed if the old Emergent MongoDB holds real users. `scripts/migrate_from_mongo.py`
imports users (keeping bcrypt password hashes, role, plan and expiry) and their push tokens.
It deliberately skips the old searches and results, which were LLM-fabricated.

```bash
alembic upgrade head
python scripts/migrate_from_mongo.py --mongo-url mongodb://... --mongo-db <db> \
    --database-url postgresql+asyncpg://... --dry-run    # drop --dry-run to write
```

## API notes

- Errors: `{"error": {"code": "...", "message": "..."}}`. 422 responses also include
  `error.details` (a list of field errors).
- Pagination: `?limit=` (default 20; values above 100 are clamped to 100) and `?cursor=`
  (opaque keyset cursor) return `{"items": [...], "next_cursor": ...}`.
- Result objects include `verified` (bool: the page was fetched and confirmed available
  and matching), `verified_at` (datetime or null) and `source_trust`
  (`"official"`, `"trusted"` or `"other"`).
- `GET /searches/{id}/results` and `GET /results` are sorted verified first, then
  `posted_date` desc (missing dates last), then `found_at` desc.
- `DELETE /results/{id}` hides the result permanently, so monitoring never re-adds the same
  URL.
- A 429 from `POST /searches/{id}/run` carries a `Retry-After` header.
- Refresh tokens are single-use. Presenting a rotated token again revokes the whole session
  family (`refresh_token_reused`), so the client must not refresh concurrently with the same
  token.
- Push payload `data`: `{"type": "new_results", "search_id", "category", "count"}`.
- `GET /health` also returns `llm_provider` (`"anthropic"`, `"openai"` or `null`).
- Each LLM call logs one line of token usage, never request content or keys:
  `llm usage provider=... model=... task=plan|extract|verify input=... cached=... output=... reasoning=...`.
