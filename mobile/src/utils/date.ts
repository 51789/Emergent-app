import type { LanguageCode } from '@/api/types';

const LOCALES: Record<LanguageCode, string> = {
  it: 'it-IT',
  en: 'en-GB',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
};

/** BCP 47 locale used for dates, numbers and speech for each app language. */
export function localeFor(language: LanguageCode): string {
  return LOCALES[language] ?? LOCALES.it;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses `YYYY-MM-DD` as a calendar date (UTC midnight, no timezone drift). Null if invalid. */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = DATE_ONLY.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  // Reject overflowing dates such as 2026-02-31.
  if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(m) - 1) return null;
  return date;
}

/** True if the string is a valid `YYYY-MM-DD` calendar date. */
export function isValidDateInput(value: string): boolean {
  return parseDateOnly(value.trim()) !== null;
}

/** `2026-07-25` -> "25 lug 2026" (localised). Returns '' for null/invalid input. */
export function formatDateOnly(value: string | null | undefined, locale: string): string {
  const date = parseDateOnly(value);
  if (!date) return value ?? '';
  try {
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return value ?? '';
  }
}

/** ISO datetime -> "25 lug 2026, 14:30" in the device timezone. Returns '' for null/invalid input. */
export function formatDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return iso;
  }
}

function localDayKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole calendar days from today to `value` (negative if in the past). Null if invalid. */
export function daysUntil(value: string | null | undefined, now: Date = new Date()): number | null {
  const target = parseDateOnly(value);
  const today = parseDateOnly(localDayKey(now));
  if (!target || !today) return null;
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** True when the calendar date is strictly before today. */
export function isDateOnlyPast(value: string | null | undefined, now: Date = new Date()): boolean {
  const days = daysUntil(value, now);
  return days !== null && days < 0;
}

/** `YYYY-MM-DD` for a Date in the device timezone. */
export function toDateInput(date: Date): string {
  return localDayKey(date);
}

/** Start/end of a calendar day as ISO 8601 UTC datetimes (used by the custom analytics range). */
export function startOfDayIso(dateInput: string): string {
  return `${dateInput.trim()}T00:00:00Z`;
}

export function endOfDayIso(dateInput: string): string {
  return `${dateInput.trim()}T23:59:59Z`;
}
