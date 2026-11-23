import type { Money, Plan } from '@/api/types';

/** Formats an amount in minor units, e.g. `{299,'EUR'}` -> "2,99 EUR" with the right symbol/locale. */
export function formatMoney(money: Money, locale: string): string {
  const amount = money.amount_cents / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: money.currency.toUpperCase(),
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${money.currency.toUpperCase()}`;
  }
}

export interface YearlySavings {
  /** Rounded percentage saved vs paying monthly for 12 months. */
  percent: number;
  /** Saved amount in minor units. */
  amount: Money;
}

/** How much the yearly cycle saves compared with 12 monthly payments; null if there is no saving. */
export function yearlySavings(plan: Pick<Plan, 'prices'>): YearlySavings | null {
  const { monthly, yearly } = plan.prices;
  if (!monthly || !yearly || monthly.currency !== yearly.currency) return null;
  const monthlyTotal = monthly.amount_cents * 12;
  const saved = monthlyTotal - yearly.amount_cents;
  if (monthlyTotal <= 0 || saved <= 0) return null;
  return {
    percent: Math.round((saved / monthlyTotal) * 100),
    amount: { amount_cents: saved, currency: monthly.currency },
  };
}

/** Largest saving percentage across plans (for the "-17%" pill on the cycle toggle). */
export function maxYearlySavingsPercent(plans: Pick<Plan, 'prices'>[]): number | null {
  const values = plans.map((plan) => yearlySavings(plan)?.percent ?? 0);
  const max = Math.max(0, ...values);
  return max > 0 ? max : null;
}

export function formatPercent(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(value);
  } catch {
    return `${(value * 100).toFixed(1)}%`;
  }
}

export function formatNumber(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return String(value);
  }
}

/** `conversion_rate` is a fraction between 0 and 1 (0.042 => "4.2%"). */
export function formatConversionRate(value: number, locale: string): string {
  return formatPercent(value, locale);
}
