import { normalizeSellerType } from '../sellerType';

describe('normalizeSellerType', () => {
  it('maps the known labels (any case, Italian or English)', () => {
    expect(normalizeSellerType('Privato')).toBe('privato');
    expect(normalizeSellerType('private')).toBe('privato');
    expect(normalizeSellerType('AGENZIA')).toBe('agenzia');
    expect(normalizeSellerType('Rivenditore')).toBe('rivenditore');
    expect(normalizeSellerType('Dealer')).toBe('rivenditore');
    expect(normalizeSellerType('Ente Pubblico')).toBe('ente');
    expect(normalizeSellerType('Public body')).toBe('ente');
  });

  it('returns null for unknown or empty values so the raw text is shown', () => {
    expect(normalizeSellerType('Costruttore')).toBeNull();
    expect(normalizeSellerType('')).toBeNull();
    expect(normalizeSellerType(null)).toBeNull();
  });
});
