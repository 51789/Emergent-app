import de from '../locales/de';
import en from '../locales/en';
import es from '../locales/es';
import fr from '../locales/fr';
import italian from '../locales/it';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') acc[path] = value;
    else Object.assign(acc, flatten(value, path));
    return acc;
  }, {});
}

const placeholders = (text: string) =>
  [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)]
    .map((match) => match[1])
    .sort();

const reference = flatten(italian as unknown as Tree);
const locales = { en, es, fr, de } as unknown as Record<string, Tree>;

describe('locale files', () => {
  it('has the same keys in every language as the Italian source', () => {
    for (const tree of Object.values(locales)) {
      expect(Object.keys(flatten(tree)).sort()).toEqual(Object.keys(reference).sort());
    }
  });

  it('uses the same interpolation placeholders as the Italian source', () => {
    for (const [code, tree] of Object.entries(locales)) {
      const flat = flatten(tree);
      for (const key of Object.keys(reference)) {
        expect({ code, key, vars: placeholders(flat[key]) }).toEqual({
          code,
          key,
          vars: placeholders(reference[key]),
        });
      }
    }
  });

  it('has no empty strings except the intentionally empty subscription status', () => {
    for (const tree of [italian as unknown as Tree, ...Object.values(locales)]) {
      const empty = Object.entries(flatten(tree)).filter(([, value]) => value.trim() === '');
      expect(empty.map(([key]) => key)).toEqual(['subscribe.status.none']);
    }
  });

  it('localises the logo tagline (three words separated by bullets)', () => {
    const expected: Record<string, string> = {
      it: 'Report • Analisi • Ricerche',
      en: 'Reports • Analysis • Research',
      es: 'Informes • Análisis • Investigación',
      fr: 'Rapports • Analyses • Recherches',
      de: 'Berichte • Analysen • Recherchen',
    };
    expect(reference['brand.tagline']).toBe(expected.it);
    for (const [code, tree] of Object.entries(locales)) {
      expect(flatten(tree)['brand.tagline']).toBe(expected[code]);
    }
  });
});
