import { appendSnippet, chipToSnippet } from '../keywordChip';

describe('chipToSnippet', () => {
  it('drops parenthetical examples and adds a prompt separator', () => {
    expect(chipToSnippet('PREZZO')).toBe('PREZZO: ');
    expect(chipToSnippet('ALTRO (metro vicine, fermate bus...)')).toBe('ALTRO: ');
    expect(chipToSnippet('ACQUISTO / AFFITTO [TIPOLOGIA]')).toBe('ACQUISTO / AFFITTO [TIPOLOGIA]: ');
  });
});

describe('appendSnippet', () => {
  it('starts a new request without a separator', () => {
    expect(appendSnippet('', 'PREZZO: ')).toBe('PREZZO: ');
    expect(appendSnippet('   ', 'PREZZO: ')).toBe('PREZZO: ');
  });

  it('separates entries with a comma unless the text already ends with punctuation', () => {
    expect(appendSnippet('Bilocale a Milano', 'PREZZO: ')).toBe('Bilocale a Milano, PREZZO: ');
    expect(appendSnippet('Bilocale a Milano.', 'PREZZO: ')).toBe('Bilocale a Milano. PREZZO: ');
    expect(appendSnippet('PREZZO:', 'LOCALITÀ: ')).toBe('PREZZO: LOCALITÀ: ');
  });
});
