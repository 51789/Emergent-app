import type { Result, SourceTrust } from '@/api/types';

export type VerificationFields = Partial<Pick<Result, 'verified' | 'verified_at' | 'source_trust'>>;

export interface VerificationInfo {
  verified: boolean;
  /** ISO datetime of the last page check; only set for verified results. */
  verifiedAt: string | null;
  trust: SourceTrust;
}

/**
 * Normalises the verification fields of a result. Older backends do not send them, and unknown
 * values must not crash the UI: anything that is not exactly `verified === true` counts as
 * not verified, and anything but "official" / "trusted" as `other`.
 */
export function getVerification(result: VerificationFields): VerificationInfo {
  const verified = result.verified === true;
  const trust: SourceTrust =
    result.source_trust === 'official' || result.source_trust === 'trusted' ? result.source_trust : 'other';
  const verifiedAt =
    verified && typeof result.verified_at === 'string' && result.verified_at.length > 0
      ? result.verified_at
      : null;
  return { verified, verifiedAt, trust };
}

export interface VerificationBadges {
  /** Navy check badge ("Verificato") or subtle slate badge ("Non verificato"). */
  status: 'verified' | 'unverified';
  /** Extra "Fonte ufficiale" label: only for official sources. */
  officialSource: boolean;
  /** Last check, for the accessibility hint of the verified badge. */
  verifiedAt: string | null;
}

/** Which verification badges a result card shows. */
export function selectVerificationBadges(result: VerificationFields): VerificationBadges {
  const info = getVerification(result);
  return {
    status: info.verified ? 'verified' : 'unverified',
    officialSource: info.trust === 'official',
    verifiedAt: info.verifiedAt,
  };
}
