import { splitTagline } from '../tagline';

describe('splitTagline', () => {
  it('splits on bullets and trims', () => {
    expect(splitTagline('Report • Analisi • Ricerche')).toEqual(['Report', 'Analisi', 'Ricerche']);
    expect(splitTagline('  Solo  ')).toEqual(['Solo']);
    expect(splitTagline('')).toEqual([]);
  });
});
