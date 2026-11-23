import type { Result } from '@/api/types';

import { getVerification, selectVerificationBadges } from '../verification';

describe('selectVerificationBadges', () => {
  it('shows the navy "verified" badge, with the check date for the accessibility hint', () => {
    expect(
      selectVerificationBadges({ verified: true, verified_at: '2026-07-20T10:00:00Z', source_trust: 'other' }),
    ).toEqual({ status: 'verified', officialSource: false, verifiedAt: '2026-07-20T10:00:00Z' });
  });

  it('shows the slate "not verified" badge for unverified results', () => {
    expect(selectVerificationBadges({ verified: false, verified_at: null, source_trust: 'other' })).toEqual({
      status: 'unverified',
      officialSource: false,
      verifiedAt: null,
    });
  });

  it('adds the "official source" label only for official sources', () => {
    expect(selectVerificationBadges({ verified: true, source_trust: 'official' }).officialSource).toBe(true);
    expect(selectVerificationBadges({ verified: false, source_trust: 'official' }).officialSource).toBe(true);
    expect(selectVerificationBadges({ verified: true, source_trust: 'trusted' }).officialSource).toBe(false);
    expect(selectVerificationBadges({ verified: true, source_trust: 'other' }).officialSource).toBe(false);
  });

  it('is tolerant of older backends that do not send the fields', () => {
    expect(selectVerificationBadges({})).toEqual({
      status: 'unverified',
      officialSource: false,
      verifiedAt: null,
    });
  });
});

describe('getVerification', () => {
  it('defaults to not verified / other when fields are missing', () => {
    expect(getVerification({})).toEqual({ verified: false, verifiedAt: null, trust: 'other' });
  });

  it('only trusts a strict boolean true and known trust values', () => {
    const weird = { verified: 'yes', source_trust: 'gov', verified_at: 42 } as unknown as Partial<Result>;
    expect(getVerification(weird)).toEqual({ verified: false, verifiedAt: null, trust: 'other' });
  });

  it('keeps the trust level and ignores verified_at on unverified results', () => {
    expect(getVerification({ verified: false, verified_at: '2026-07-20T10:00:00Z', source_trust: 'trusted' })).toEqual(
      { verified: false, verifiedAt: null, trust: 'trusted' },
    );
    expect(getVerification({ verified: true, verified_at: '', source_trust: 'official' })).toEqual({
      verified: true,
      verifiedAt: null,
      trust: 'official',
    });
  });
});
