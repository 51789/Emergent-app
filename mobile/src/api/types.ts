/**
 * Types of the Consulens REST API (`${EXPO_PUBLIC_API_URL}/api/v1`).
 * This file is the client-side mirror of the API contract: keep it in sync with the server.
 */

export const CATEGORY_IDS = [
  'immobili',
  'bandi',
  'auto_moto',
  'gare_appalto',
  'divertimento',
  'finanza',
  'nuove_leggi',
  'lavoro',
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export const LANGUAGE_CODES = ['it', 'en', 'es', 'fr', 'de'] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export type Role = 'user' | 'admin';
export type PlanId = 'free' | 'pro' | 'premium';
export type VoiceGender = 'female' | 'male';
export type AuthProvider = 'password' | 'google';
export type BillingCycle = 'monthly' | 'yearly';

/** Error envelope: `{"error":{"code","message"}}` (422 validation errors also carry `details`). */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface Paginated<T> {
  items: T[];
  next_cursor: string | null;
}

export interface PageParams {
  limit?: number;
  cursor?: string;
}

// ---------------------------------------------------------------- auth / user

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  plan: PlanId;
  plan_expires_at: string | null;
  language: LanguageCode;
  voice_gender: VoiceGender;
  auth_providers: AuthProvider[];
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
  user: User;
}

export interface RegisterBody {
  email: string;
  password: string;
  name?: string;
  language?: LanguageCode;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface UpdateMeBody {
  name?: string;
  language?: LanguageCode;
  voice_gender?: VoiceGender;
}

// -------------------------------------------------------------------- searches

export type SearchRunStatus = 'pending' | 'running' | 'ok' | 'error' | 'no_provider';

export interface Search {
  id: string;
  query: string;
  category: CategoryId;
  language: LanguageCode;
  is_active: boolean;
  filters: Record<string, unknown>;
  keywords: string[];
  summary: string | null;
  created_at: string;
  last_run_at: string | null;
  last_run_status: SearchRunStatus;
  last_error: string | null;
  next_run_at: string | null;
  results_count: number;
  unseen_count: number;
}

export interface SearchListParams extends PageParams {
  category?: CategoryId;
  is_active?: boolean;
}

export interface CreateSearchBody {
  query: string;
  category: CategoryId;
  language: LanguageCode;
}

export interface UpdateSearchBody {
  is_active?: boolean;
}

export type SearchCounts = Partial<Record<CategoryId, { active: number; unseen: number }>>;

export type SearchBulkAction = 'delete' | 'activate' | 'deactivate';

export interface BulkResponse {
  affected: number;
}

// --------------------------------------------------------------------- results

export type ResultStatus = 'ATTIVO' | 'SCADUTO' | 'SCONOSCIUTO';

/** How much the source domain is trusted: official bodies, known trusted sites, anything else. */
export type SourceTrust = 'official' | 'trusted' | 'other';

export interface Result {
  id: string;
  search_id: string;
  category: CategoryId;
  title: string;
  summary: string;
  url: string;
  source_domain: string;
  image_url: string | null;
  price: string | null;
  location: string | null;
  seller_type: string | null;
  status: ResultStatus;
  /** `YYYY-MM-DD` or null. */
  posted_date: string | null;
  /** `YYYY-MM-DD` or null. */
  expiry_date: string | null;
  contacts: string[];
  is_favorite: boolean;
  seen: boolean;
  found_at: string;
  /**
   * Result verification (additive fields). Optional because older backends do not send them:
   * treat a missing value as `verified: false` / `source_trust: 'other'` (see `getVerification`).
   * Lists are sorted by the server (verified first, then posted_date desc): never re-sort client-side.
   */
  verified?: boolean;
  /** ISO datetime of the last page check. */
  verified_at?: string | null;
  source_trust?: SourceTrust;
}

export interface ResultListParams extends PageParams {
  favorite?: boolean;
  unseen?: boolean;
  category?: CategoryId;
}

export interface UpdateResultBody {
  is_favorite?: boolean;
  seen?: boolean;
}

export type ResultBulkAction = 'delete' | 'favorite' | 'unfavorite' | 'mark_seen';

// ---------------------------------------------------------------- notifications

export interface UnseenCount {
  count: number;
}

export type PushPlatform = 'ios' | 'android' | 'web';

// --------------------------------------------------------------------- billing

export interface Money {
  amount_cents: number;
  currency: string;
}

export interface Plan {
  id: PlanId;
  name: string;
  max_active_searches: number;
  refresh_interval_hours: number;
  prices: { monthly: Money | null; yearly: Money | null };
  features: string[];
}

export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'none';

export interface BillingMe {
  plan: PlanId;
  cycle: BillingCycle | null;
  status: SubscriptionStatus;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export interface CheckoutBody {
  plan: Exclude<PlanId, 'free'>;
  cycle: BillingCycle;
  success_url: string;
  cancel_url: string;
}

export interface UrlResponse {
  url: string;
}

// ----------------------------------------------------------------------- admin

export interface AdminUserListParams extends PageParams {
  q?: string;
}

export interface AdminCreateUserBody {
  email: string;
  password: string;
  name?: string;
  role: Role;
  plan: PlanId;
}

export interface AdminUpdateUserBody {
  email?: string;
  password?: string;
  name?: string;
  role?: Role;
  plan?: PlanId;
}

export type AnalyticsRangeKey = 'realtime' | '7d' | '30d' | '90d' | '180d' | '365d' | 'custom';

export interface AnalyticsRangeParams {
  range: AnalyticsRangeKey;
  /** Only for `range: 'custom'`. ISO 8601 datetime (UTC). */
  from?: string;
  /** Only for `range: 'custom'`. ISO 8601 datetime (UTC). */
  to?: string;
}

export interface AnalyticsOverview {
  range: { from: string; to: string };
  revenue_monthly_estimate_cents: number;
  active_subscribers: number;
  new_signups: number;
  conversion_rate: number;
  plan_split: Record<PlanId, number>;
  total_users: number;
  total_searches: number;
}

export type AnalyticsMetric = 'signups' | 'searches' | 'subscriptions';
export type AnalyticsBucket = 'hour' | 'day' | 'week' | 'month';

export interface AnalyticsTimeseries {
  bucket: AnalyticsBucket;
  points: { t: string; value: number }[];
}

export interface AnalyticsCategories {
  items: { category: CategoryId; searches: number; results: number }[];
}
