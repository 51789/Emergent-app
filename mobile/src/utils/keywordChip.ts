/**
 * Turns an example keyword chip (e.g. `ALTRO (metro vicine, fermate bus...)`)
 * into the snippet inserted in the search box when the chip is tapped (`ALTRO: `).
 */
export function chipToSnippet(chipText: string): string {
  const label = chipText.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  return `${label}: `;
}

/** Appends `snippet` to the current input, separating entries with a comma/space. */
export function appendSnippet(current: string, snippet: string): string {
  const trimmed = current.trimEnd();
  if (!trimmed) return snippet;
  const separator = /[,;.:]$/.test(trimmed) ? ' ' : ', ';
  return `${trimmed}${separator}${snippet}`;
}
