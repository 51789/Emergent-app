export type SellerKey = 'privato' | 'agenzia' | 'rivenditore' | 'ente';

/**
 * The API returns `seller_type` as free text (the original app used the Italian labels
 * Privato / Agenzia / Rivenditore / Ente Pubblico). Known values map to a translatable key;
 * anything else is shown as-is.
 */
export function normalizeSellerType(raw: string | null | undefined): SellerKey | null {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) return null;
  if (value.startsWith('priv') || value === 'private') return 'privato';
  if (value.startsWith('agen')) return 'agenzia';
  if (value.startsWith('rivend') || value === 'dealer') return 'rivenditore';
  if (value.startsWith('ente') || value.includes('public') || value.includes('pubblic')) return 'ente';
  return null;
}
