import { formatConversionRate, formatMoney, maxYearlySavingsPercent, yearlySavings } from '../format';

const plan = (monthly: number | null, yearly: number | null, currency = 'EUR') => ({
  prices: {
    monthly: monthly === null ? null : { amount_cents: monthly, currency },
    yearly: yearly === null ? null : { amount_cents: yearly, currency },
  },
});

describe('yearlySavings', () => {
  it('computes the saving versus twelve monthly payments', () => {
    // PRO: 2.99/month, 29.99/year => saves 5.89 (16.4%)
    const savings = yearlySavings(plan(299, 2999));
    expect(savings?.percent).toBe(16);
    expect(savings?.amount).toEqual({ amount_cents: 589, currency: 'EUR' });
  });

  it('returns null when there is no price, no saving or mixed currencies', () => {
    expect(yearlySavings(plan(null, null))).toBeNull();
    expect(yearlySavings(plan(499, null))).toBeNull();
    expect(yearlySavings(plan(100, 1200))).toBeNull();
    expect(yearlySavings(plan(100, 1500))).toBeNull();
    expect(
      yearlySavings({
        prices: {
          monthly: { amount_cents: 100, currency: 'EUR' },
          yearly: { amount_cents: 500, currency: 'USD' },
        },
      }),
    ).toBeNull();
  });
});

describe('maxYearlySavingsPercent', () => {
  it('picks the best saving across plans', () => {
    expect(maxYearlySavingsPercent([plan(299, 2999), plan(499, 4999)])).toBe(17);
    expect(maxYearlySavingsPercent([plan(null, null)])).toBeNull();
  });
});

describe('formatMoney', () => {
  it('formats minor units with currency symbol', () => {
    expect(formatMoney({ amount_cents: 299, currency: 'EUR' }, 'en-GB')).toContain('2.99');
    expect(formatMoney({ amount_cents: 299, currency: 'eur' }, 'it-IT')).toContain('2,99');
  });

  it('falls back to a plain amount for unknown currency codes', () => {
    expect(formatMoney({ amount_cents: 1000, currency: '??' }, 'en-GB')).toBe('10.00 ??');
  });
});

describe('formatConversionRate', () => {
  it('formats the 0-1 fraction as a percentage', () => {
    expect(formatConversionRate(0.042, 'en-GB')).toBe('4.2%');
    expect(formatConversionRate(0, 'en-GB')).toBe('0%');
    expect(formatConversionRate(1, 'en-GB')).toBe('100%');
  });
});
