import { classifyContact, getHostLabel, isWebUrl } from '../url';

describe('getHostLabel', () => {
  it('extracts a clean host', () => {
    expect(getHostLabel('https://www.immobiliare.it/annunci/123?x=1')).toBe('immobiliare.it');
    expect(getHostLabel('http://sub.example.com:8080/path')).toBe('sub.example.com:8080');
    expect(getHostLabel('example.org/foo')).toBe('example.org');
    expect(getHostLabel(null)).toBe('');
  });
});

describe('isWebUrl', () => {
  it('only allows http(s) links', () => {
    expect(isWebUrl('https://a.b')).toBe(true);
    expect(isWebUrl('HTTP://a.b')).toBe(true);
    expect(isWebUrl('javascript:alert(1)')).toBe(false);
    expect(isWebUrl('tel:123')).toBe(false);
    expect(isWebUrl('')).toBe(false);
  });
});

describe('classifyContact', () => {
  it('makes emails, phones and links tappable', () => {
    expect(classifyContact('info@agenzia.it')).toEqual({ kind: 'email', href: 'mailto:info@agenzia.it' });
    expect(classifyContact('+39 02 1234 5678')).toEqual({ kind: 'phone', href: 'tel:+390212345678' });
    expect(classifyContact('https://example.com/contatti')).toEqual({
      kind: 'url',
      href: 'https://example.com/contatti',
    });
  });

  it('leaves free text alone', () => {
    expect(classifyContact('Chiedere di Mario')).toEqual({ kind: 'text', href: null });
    expect(classifyContact('12')).toEqual({ kind: 'text', href: null });
  });
});
