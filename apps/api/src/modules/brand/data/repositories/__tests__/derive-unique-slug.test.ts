import { deriveUniqueSlug, slugify } from '../derive-unique-slug';

describe('slugify', () => {
  it('lowercases and kebab-cases a basic name', () => {
    expect(slugify('Acme Holdings')).toBe('acme-holdings');
  });

  it('strips diacritics via NFKD', () => {
    expect(slugify('Café Über')).toBe('cafe-uber');
  });

  it('collapses punctuation runs to a single dash', () => {
    expect(slugify("A!!B,,C")).toBe('a-b-c');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('  __weird__  ')).toBe('weird');
  });

  it('collapses internal dash runs', () => {
    expect(slugify('a---b')).toBe('a-b');
  });

  it('returns the empty string for an emoji-only name', () => {
    expect(slugify('🚀✨')).toBe('');
  });

  it('preserves digits', () => {
    expect(slugify('Brand 2026')).toBe('brand-2026');
  });
});

describe('deriveUniqueSlug', () => {
  it('returns the natural slug on first try when free', async () => {
    const taken = new Set<string>();
    const result = await deriveUniqueSlug('Acme Holdings', async (s) => taken.has(s));
    expect(result).toBe('acme-holdings');
  });

  it('appends -2 when natural slug is taken once', async () => {
    const taken = new Set(['acme']);
    const result = await deriveUniqueSlug('Acme', async (s) => taken.has(s));
    expect(result).toBe('acme-2');
  });

  it('appends -3 when both natural and -2 are taken', async () => {
    const taken = new Set(['acme', 'acme-2']);
    const result = await deriveUniqueSlug('Acme', async (s) => taken.has(s));
    expect(result).toBe('acme-3');
  });

  it('progresses past -10 boundary', async () => {
    const taken = new Set(['acme', ...Array.from({ length: 12 }, (_, i) => `acme-${i + 2}`)]);
    const result = await deriveUniqueSlug('Acme', async (s) => taken.has(s));
    expect(result).toBe('acme-14');
  });

  it('falls back to a brand-<hex> slug for emoji-only names', async () => {
    const taken = new Set<string>();
    const result = await deriveUniqueSlug('🚀✨', async (s) => taken.has(s));
    expect(result).toMatch(/^brand-[0-9a-f]{6}$/);
  });

  it('honours the isTaken probe order (returns first untaken candidate)', async () => {
    const probes: string[] = [];
    const result = await deriveUniqueSlug('Acme', async (s) => {
      probes.push(s);
      return s === 'acme';
    });
    expect(result).toBe('acme-2');
    expect(probes).toEqual(['acme', 'acme-2']);
  });
});
