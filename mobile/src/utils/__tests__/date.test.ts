import {
  daysUntil,
  endOfDayIso,
  formatDateOnly,
  formatDateTime,
  isDateOnlyPast,
  isValidDateInput,
  localeFor,
  parseDateOnly,
  startOfDayIso,
  toDateInput,
} from '../date';

describe('parseDateOnly', () => {
  it('parses valid calendar dates', () => {
    expect(parseDateOnly('2026-07-25')?.toISOString()).toBe('2026-07-25T00:00:00.000Z');
  });

  it('rejects malformed, overflowing and empty values', () => {
    expect(parseDateOnly('25/07/2026')).toBeNull();
    expect(parseDateOnly('2026-02-31')).toBeNull();
    expect(parseDateOnly('2026-13-01')).toBeNull();
    expect(parseDateOnly('')).toBeNull();
    expect(parseDateOnly(null)).toBeNull();
    expect(parseDateOnly(undefined)).toBeNull();
  });
});

describe('isValidDateInput', () => {
  it('accepts YYYY-MM-DD with surrounding spaces only', () => {
    expect(isValidDateInput(' 2026-01-31 ')).toBe(true);
    expect(isValidDateInput('2026-1-31')).toBe(false);
  });
});

describe('formatDateOnly', () => {
  it('formats without timezone drift', () => {
    expect(formatDateOnly('2026-07-25', 'en-GB')).toMatch(/25 Jul 2026/);
    expect(formatDateOnly('2026-01-01', 'en-GB')).toMatch(/01 Jan 2026/);
  });

  it('returns the raw value for invalid input and empty for null', () => {
    expect(formatDateOnly('soon', 'en-GB')).toBe('soon');
    expect(formatDateOnly(null, 'en-GB')).toBe('');
  });
});

describe('formatDateTime', () => {
  it('formats an ISO datetime and tolerates garbage', () => {
    expect(formatDateTime('2026-07-25T10:30:00Z', 'en-GB')).toMatch(/Jul 2026/);
    expect(formatDateTime('nope', 'en-GB')).toBe('');
    expect(formatDateTime(null, 'en-GB')).toBe('');
  });
});

describe('daysUntil / isDateOnlyPast', () => {
  const now = new Date(2026, 6, 25, 15, 0, 0); // 25 Jul 2026, local time

  it('counts whole calendar days', () => {
    expect(daysUntil('2026-07-25', now)).toBe(0);
    expect(daysUntil('2026-07-28', now)).toBe(3);
    expect(daysUntil('2026-07-20', now)).toBe(-5);
    expect(daysUntil('garbage', now)).toBeNull();
  });

  it('treats only dates before today as past', () => {
    expect(isDateOnlyPast('2026-07-24', now)).toBe(true);
    expect(isDateOnlyPast('2026-07-25', now)).toBe(false);
    expect(isDateOnlyPast(null, now)).toBe(false);
  });
});

describe('helpers', () => {
  it('maps app languages to locales with an Italian fallback', () => {
    expect(localeFor('de')).toBe('de-DE');
    expect(localeFor('xx' as never)).toBe('it-IT');
  });

  it('builds day boundaries and date inputs', () => {
    expect(startOfDayIso(' 2026-07-01 ')).toBe('2026-07-01T00:00:00Z');
    expect(endOfDayIso('2026-07-31')).toBe('2026-07-31T23:59:59Z');
    expect(toDateInput(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
