import { formatBucketLabel } from '../chartLabels';

describe('formatBucketLabel', () => {
  it('formats day and week buckets as dd/MM', () => {
    expect(formatBucketLabel('2026-07-23T12:00:00Z', 'day', 'en-GB')).toBe('23/07');
    expect(formatBucketLabel('2026-07-20T12:00:00Z', 'week', 'en-GB')).toBe('20/07');
  });

  it('formats month buckets as MM/yy', () => {
    expect(formatBucketLabel('2026-07-15T12:00:00Z', 'month', 'en-GB')).toBe('07/26');
  });

  it('formats hour buckets as HH:mm', () => {
    expect(formatBucketLabel('2026-07-23T14:00:00Z', 'hour', 'en-GB')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('returns the input for invalid timestamps', () => {
    expect(formatBucketLabel('garbage', 'day', 'en-GB')).toBe('garbage');
  });
});
