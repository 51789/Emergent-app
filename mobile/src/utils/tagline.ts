/** Splits a tagline like "Report • Analisi • Ricerche" into its words (bullets are re-drawn in slate). */
export function splitTagline(tagline: string): string[] {
  return tagline
    .split('•')
    .map((part) => part.trim())
    .filter(Boolean);
}
