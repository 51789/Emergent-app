/** Friendly host label for a URL: `https://www.immobiliare.it/x` -> `immobiliare.it`. */
export function getHostLabel(url: string | null | undefined): string {
  if (!url) return '';
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url.trim());
  const host = match ? match[1] : url.trim().split(/[/?#]/)[0];
  return host.replace(/^www\./i, '');
}

/** True for http(s) URLs only: result links come from third parties, never open other schemes. */
export function isWebUrl(url: string | null | undefined): boolean {
  return !!url && /^https?:\/\//i.test(url.trim());
}

export type ContactKind = 'email' | 'phone' | 'url' | 'text';

export interface ContactLink {
  kind: ContactKind;
  /** URL to open (`mailto:`, `tel:`, `https:`) or null for plain text. */
  href: string | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s().-]{6,}$/;

/** Classifies a free-form contact string so the UI can make it tappable. */
export function classifyContact(contact: string): ContactLink {
  const value = contact.trim();
  if (EMAIL.test(value)) return { kind: 'email', href: `mailto:${value}` };
  if (PHONE.test(value)) return { kind: 'phone', href: `tel:${value.replace(/[^\d+]/g, '')}` };
  if (isWebUrl(value)) return { kind: 'url', href: value };
  return { kind: 'text', href: null };
}
