import type { AnalyticsBucket } from '@/api/types';

/**
 * Short x-axis label for a time-series point.
 * hour -> `14:00`, day/week -> `23/07` (week = first day of the week), month -> `07/26`.
 */
export function formatBucketLabel(isoTimestamp: string, bucket: AnalyticsBucket, locale: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return isoTimestamp;
  try {
    switch (bucket) {
      case 'hour':
        return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
      case 'month':
        return new Intl.DateTimeFormat(locale, { month: '2-digit', year: '2-digit' }).format(date);
      default:
        return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(date);
    }
  } catch {
    return isoTimestamp.slice(0, 10);
  }
}
