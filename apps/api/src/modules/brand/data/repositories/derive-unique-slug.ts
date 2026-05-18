/**
 * Deterministic slugifier: lowercase, NFKD-normalize, strip combining marks,
 * collapse non-alphanumerics to `-`, trim leading/trailing dashes.
 *
 * Returns the empty string if the result has no kebab-case characters; the
 * caller (`deriveUniqueSlug`) substitutes a deterministic fallback.
 */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

/**
 * Pseudo-random 6-hex suffix used when slugification yields an empty string
 * (e.g. emoji-only or punctuation-only names). Kept short and lowercase so
 * the fallback slug still matches the kebab-case regex enforced on the
 * response schema.
 */
function fallbackSuffix(): string {
  const bytes = [
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
  ];
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 6);
}

/**
 * Loop the dedupe suffix on top of `slugify(name)` until `isTaken` returns
 * false. The first attempt is the natural slug; subsequent attempts append
 * `-2`, `-3`, ... in sequence. Calls `isTaken` with each candidate; the
 * implementation is the caller's concern (typically a scoped Prisma count).
 */
export async function deriveUniqueSlug(
  name: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(name) || `brand-${fallbackSuffix()}`;
  let candidate = base;
  let suffix = 2;
  while (await isTaken(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
